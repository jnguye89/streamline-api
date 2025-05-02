const { google } = require('googleapis');
const { OAuth2 } = google.auth;

// Set up your OAuth 2.0 credentials here
const CLIENT_ID = 'read from json';
const CLIENT_SECRET = 'read from json';
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';  // The redirect URI you registered in the Google Cloud Console

const oauth2Client = new OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Generate an authentication URL with offline access to get a refresh token
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',  // This is necessary for getting a refresh token
  scope: ['https://www.googleapis.com/auth/drive.file'],  // The Google Drive scope, you can adjust if needed
});

console.log('Visit the URL and grant access:', authUrl);

