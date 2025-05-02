const axios = require('axios');

async function getRandomStations(limit = 10) {
    const url = `https://de1.api.radio-browser.info/json/stations/topclick/${limit}`;
    const response = await axios.get(url);
    return response.data.map(d => d.url);
}


module.exports = {
    getRandomStations,
  };