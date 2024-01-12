const fetch = require("node-fetch");
const { google } = require("googleapis");
const key = require("./service_account.json");

const jwtClient = new google.auth.JWT(
    key.client_email,
    null,
    key.private_key,
    ["https://www.googleapis.com/auth/indexing"],
    null
);

jwtClient.authorize(async function(err, tokens) {
    if (err) {
        console.log(err);
        return;
    }

    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${tokens.access_token}`
        },
        body: JSON.stringify({
            "url": "http://example.com/jobs/42",
            "type": "URL_UPDATED"
        })
    };

    try {
        const response = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", options);
        const body = await response.json();
        console.log(body);
    } catch (error) {
        console.error(error);
    }
});
