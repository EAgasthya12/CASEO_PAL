const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5001';

const logError = (message, data) => {
    try {
        const logPath = path.join(__dirname, '../bridge_error.log');
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}\nData: ${JSON.stringify(data, null, 2)}\n\n`;
        fs.appendFileSync(logPath, logEntry);
    } catch (e) {
        console.error('Failed to write to log file:', e);
    }
};

/**
 * Sends text to Python service for classification and extraction.
 * @param {string} text - The email body or snippet.
 * @returns {Promise<Object>} - The intelligence result.
 */
const analyzeText = async (text) => {
    try {
        const response = await axios.post(`${PYTHON_API_URL}/classify`, { text });
        return response.data;
    } catch (error) {
        console.error('Error calling Python Intelligence Layer:', error.message);
        logError('Error calling Python Intelligence Layer', {
            message: error.message,
            url: `${PYTHON_API_URL}/classify`,
            textSnippet: text ? text.substring(0, 100) : 'N/A',
            textLength: text ? text.length : 0,
            response: error.response ? error.response.data : 'No response'
        });

        // Return default fallback
        return {
            category: 'Unknown',
            confidence: 0,
            deadlines: [],
            urgency: 'Low'
        };
    }
};

module.exports = { analyzeText };
