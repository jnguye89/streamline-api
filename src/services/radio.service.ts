const axios = require('axios');

export const getRandomStations = async (limit = 10) => {
    const url = `https://de1.api.radio-browser.info/json/stations/topclick/${limit}`;
    const response = await axios.get(url);
    return response.data.map((d: { url: any; name: any; }) => {
        return {
            url: d.url,
            name: d.name,
        }});
    // return response;
}


module.exports = {
    getRandomStations,
  };