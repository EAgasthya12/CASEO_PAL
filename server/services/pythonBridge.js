const axios = require('axios');

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5001';

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
