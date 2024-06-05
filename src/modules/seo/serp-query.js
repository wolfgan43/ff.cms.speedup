const fetch = require('node-fetch');
const { parse } = require('node-html-parser');
const ProxyAgent = require('proxy-agent');

const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:107.0) Gecko/20100101 Firefox/107.0',
];

/**
 * Genera un user agent casuale dall'array fornito.
 * @returns {string} User agent casuale.
 */
function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Esegue lo scraping di una pagina di ricerca Google e restituisce un array di link ai siti web.
 *
 * @param {string} query La query di ricerca da utilizzare per la ricerca Google.
 * @param {string} proxyUrl (Opzionale) URL del proxy da utilizzare per la richiesta.
 * @returns {Promise<string[]>} Un array contenente i link ai siti web trovati.
 */
export async function scrapeGoogleSearchResults(query, proxyUrl) {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://www.google.com/search?q=${encodedQuery}`;

    const headers = {
        'User-Agent': getRandomUserAgent(),
    };

    if (proxyUrl) {
        const agent = new ProxyAgent(proxyUrl);
        headers['X-Forwarded-For'] = Math.random().toString(16).substring(2, 10) + '.' + Math.random().toString(16).substring(2, 10) + '.' + Math.random().toString(16).substring(2, 10) + '.' + Math.random().toString(16).substring(2, 10); // Spoof IP address
        console.log(`Utilizzo del proxy: ${proxyUrl}`);
    }

    try {
        const response = await fetch(url, { headers });
        const html = await response.text();
        const root = parse(html);

        // Estrai i link dai risultati di ricerca
        const links = [];
        const results = root.querySelectorAll('.tF2CUI'); // Use querySelectorAll

        for (const result of results) {
            const link = result.querySelector('a')?.getAttribute('href');
            if (link && link.startsWith('/url?q=')) {
                const fullUrl = decodeURIComponent(link.substring(7));
                links.push(fullUrl);
            }
        }

        return links;
    } catch (error) {
        console.error(`Errore durante lo scraping della pagina di ricerca Google per '${query}': ${error.message}`);
        return [];
    }
}

// Esempio di utilizzo (senza proxy)
const query = 'ricette di cucina italiana';
scrapeGoogleSearchResults(query)
    .then((links) => {
        console.log(links);
    })
    .catch((error) => {
        console.error(error);
    });

// Esempio di utilizzo (con proxy)
// Sostituisci 'http://your-proxy.com:port' con il tuo URL del proxy
const proxyUrl = 'http://your-proxy.com:port';
scrapeGoogleSearchResults(query, proxyUrl)
    .then((links) => {
        console.log(links);
    })
    .catch((error) => {
        console.error(error);
    });
