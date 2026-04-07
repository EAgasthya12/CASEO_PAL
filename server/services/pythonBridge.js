const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5001';
const REQUEST_TIMEOUT_MS = 15000; // 15 seconds — avoids hanging forever if Python crashes

// ── Circuit Breaker ───────────────────────────────────────────────────────────
// If 3 consecutive Gemini calls fail, skip Python for 30 seconds.
const circuit = {
    failures: 0,
    openUntil: null,
    MAX_FAILURES: 3,
    OPEN_FOR_MS: 30_000,
};

const isCircuitOpen = () => {
    if (circuit.openUntil && Date.now() < circuit.openUntil) return true;
    if (circuit.openUntil && Date.now() >= circuit.openUntil) {
        // Half-open: reset and allow one probe request
        circuit.failures = 0;
        circuit.openUntil = null;
    }
    return false;
};

const recordSuccess = () => { circuit.failures = 0; };
const recordFailure = () => {
    circuit.failures++;
    if (circuit.failures >= circuit.MAX_FAILURES) {
        circuit.openUntil = Date.now() + circuit.OPEN_FOR_MS;
        console.warn(`[PythonBridge] Circuit opened — skipping Python for ${circuit.OPEN_FOR_MS / 1000}s`);
    }
};

// ── Error logger ──────────────────────────────────────────────────────────────
const logError = (message, data) => {
    console.error(`[PythonBridge Error] ${message}\nData:`, JSON.stringify(data, null, 2));
};

// ── Default fallback when Python is unavailable ───────────────────────────────
const FALLBACK = { category: 'Personal', confidence: 0.4, deadlines: [], urgency: 'Low' };

/**
 * Sends a single email to the Python service for classification + extraction.
 */
const analyzeText = async (text, userCategories = [], sender = '') => {
    if (isCircuitOpen()) {
        console.warn('[PythonBridge] Circuit open — using fallback for this email.');
        return FALLBACK;
    }

    try {
        const response = await axios.post(
            `${PYTHON_API_URL}/classify`,
            { text, user_categories: userCategories, sender },
            { timeout: REQUEST_TIMEOUT_MS }
        );
        recordSuccess();
        return response.data;
    } catch (error) {
        recordFailure();
        logError('analyzeText failed', {
            message: error.message,
            url: `${PYTHON_API_URL}/classify`,
            textSnippet: text ? text.substring(0, 100) : 'N/A',
            response: error.response ? error.response.data : 'No response',
        });
        return FALLBACK;
    }
};

/**
 * Sends a batch of emails to Python's /classify-batch endpoint.
 * Falls back to individual analyzeText calls if the batch endpoint fails.
 *
 * @param {Array<{id: string, text: string, sender?: string}>} emails
 * @param {string[]} userCategories
 * @returns {Promise<Object>} Map of { emailId: intelligenceResult }
 */
const analyzeBatch = async (emails, userCategories = []) => {
    if (!emails || emails.length === 0) return {};

    if (isCircuitOpen()) {
        console.warn('[PythonBridge] Circuit open — using fallback for entire batch.');
        const fallbackMap = {};
        emails.forEach(e => { fallbackMap[e.id] = FALLBACK; });
        return fallbackMap;
    }

    try {
        const response = await axios.post(
            `${PYTHON_API_URL}/classify-batch`,
            {
                emails: emails.map(e => ({ id: e.id, text: e.text, sender: e.sender || '' })),
                user_categories: userCategories,
            },
            { timeout: REQUEST_TIMEOUT_MS * 3 }  // batch gets 3× timeout
        );
        recordSuccess();
        return response.data.results || {};
    } catch (error) {
        recordFailure();
        console.error('[PythonBridge] Batch call failed, falling back to sequential:', error.message);

        // Sequential fallback
        const results = {};
        for (const e of emails) {
            results[e.id] = await analyzeText(e.text, userCategories, e.sender || '');
        }
        return results;
    }
};

module.exports = { analyzeText, analyzeBatch };
