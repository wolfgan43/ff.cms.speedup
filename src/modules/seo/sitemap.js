const fs = require('fs');
const path = require('path');

export function generateSitemap(urls) {
    const currentDate = new Date().toISOString();

    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
    const urlsetHeader = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    const urlsetFooter = '</urlset>';

    const priorityFactor = 0.2; // Puoi regolare questo fattore in base alle tue esigenze

    const formattedUrls = urls.map((url, index) => {
        const lastmod = currentDate;
        const priority = 1.0 - index * priorityFactor;

        return `
            <url>
                <loc>${url}</loc>
                <lastmod>${lastmod}</lastmod>
                <priority>${priority.toFixed(2)}</priority>
            </url>
        `;
    });

    const sitemapContent = xmlHeader + urlsetHeader + formattedUrls.join('\n') + urlsetFooter;

    // Salva il file sitemap.xml
    const outputPath = path.join(__dirname, 'sitemap.xml');
    fs.writeFileSync(outputPath, sitemapContent);

    console.log(`Sitemap generata con successo in: ${outputPath}`);
}

const generateRobotsTxt = (sitemapPath) => {
    const robotsTxtContent = `User-agent: *\nAllow: /\n\nSitemap: ${sitemapPath}\n`;

    // Salva il file robots.txt
    const outputPath = path.join(__dirname, 'robots.txt');
    fs.writeFileSync(outputPath, robotsTxtContent);

    console.log(`File robots.txt generato con successo in: ${outputPath}`);
};