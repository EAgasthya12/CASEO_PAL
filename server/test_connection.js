const axios = require('axios');

const PYTHON_API_URL = 'http://localhost:5001';

const testConnection = async () => {
    try {
        console.log(`Testing connection to ${PYTHON_API_URL}...`);
        const response = await axios.get(`${PYTHON_API_URL}/health`);
        console.log('Health Check Status:', response.status);
        console.log('Health Check Data:', response.data);

        console.log('Testing /classify endpoint...');
        const classifyResponse = await axios.post(`${PYTHON_API_URL}/classify`, {
            text: "Assignment due tomorrow"
        });
        console.log('Classify Result:', classifyResponse.data);

    } catch (error) {
        console.error('Connection Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
            console.error('Response Status:', error.response.status);
        }
    }
};

testConnection();
