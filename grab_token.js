const express = require('express');
const { google } = require('googleapis');
const app = express();

// Your OAuth 2.0 credentials
const CLIENT_ID = 'read from json';
const CLIENT_SECRET = 'read from json';
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';  // The redirect URI you registered in the Google Cloud Console

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Handle OAuth2 callback to exchange code for tokens
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;  // Extract the "code" from the URL

  try {
    // Exchange the authorization code for access and refresh tokens
    const { tokens } = await oauth2Client.getToken(code);

    // Set the credentials with the received tokens
    oauth2Client.setCredentials(tokens);

    // Log the refresh token and access token (you can save the refresh token to use later)
    console.log('Access Token:', tokens.access_token);
    console.log('Refresh Token:', tokens.refresh_token);  // This is the one you need for refreshing access tokens

    // Send a response to the user
    res.send('Authorization complete. Tokens received.');

  } catch (error) {
    console.error('Error exchanging code for tokens', error);
    res.status(500).send('Failed to get tokens');
  }
});

app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});
