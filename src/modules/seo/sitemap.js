import {project, SEP} from "../../constant.js";
import fs from 'fs';

const countChar = (string, char = SEP) => {
    if (string === char) {
        return 0;
    }

    return (string.match(new RegExp(char, 'g')) || []).length;
}
export function generateSitemap(urls) {
    const currentDate = new Date();

    const year = currentDate.getUTCFullYear();
    const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getUTCDate()).padStart(2, '0');
    const hours = String(currentDate.getUTCHours()).padStart(2, '0');
    const minutes = String(currentDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(currentDate.getUTCSeconds()).padStart(2, '0');
    const lastmod = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+00:00`;

    const excludePatterns = [/404/];

    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
    const urlsetHeader = `<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">`;
    const urlsetFooter = '</urlset>';

    const formattedUrls = urls
    .map((url) => project.distWebUrl(url))
    .filter((url) => !excludePatterns.some((pattern) => pattern.test(url))) // Escludi le corrispondenze alle regex
    .sort((a, b) => {
        const countA = countChar(a);
        const countB = countChar(b);
        if (countA !== countB) {
            return countA - countB;
        }
        if (countA === countB) {
            return a.localeCompare(b);
        }
    })
    .map((url) => {
        const separatorCount = countChar((url.endsWith(SEP) ? url.slice(0, -1) : url), SEP);
        const priority = Math.pow(0.8, separatorCount);

        return `
<url>
  <loc>${project.options.host + url}</loc>
  <lastmod>${lastmod}</lastmod>
  <priority>${priority.toFixed(2)}</priority>
</url>`;
    }).join('');

    const sitemapContent = `${xmlHeader}
${urlsetHeader}
${formattedUrls}
${urlsetFooter}`;
    const sitemapPath = SEP + 'sitemap.xml';
    const outputPath = project.distPath(sitemapPath);
    fs.writeFileSync(outputPath, sitemapContent);

    console.log(`Successfully generated sitemap.xml file at: ${outputPath}`);

    generateRobotsTxt(sitemapPath);
    generateHeaders();
}

const generateRobotsTxt = (sitemapPath) => {
    if (!project.options.host) {
        console.log('Skipping robots.txt generation: host option not found');
        return;
    }
    const robotsTxtContent = `User-agent: *
Allow: /
Disallow: /cdn-cgi

Sitemap: ${project.options.host + sitemapPath}`;
    const outputPath = project.distPath(SEP + 'robots.txt');

    fs.writeFileSync(outputPath, robotsTxtContent);

    console.log(`Successfully generated robots.txt file at: ${outputPath}`);
}

const generateHeaders = () => {
    const headers2 = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': 2592000, // 30 days
        'Content-Type': 'text/plain; charset=UTF-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'no-referrer-when-downgrade',
        'Feature-Policy': 'none',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    };

    const headers = `/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
`;
    const outputPath = project.distPath(SEP + '_headers');

    fs.writeFileSync(outputPath, headers);

    console.log(`Successfully generated _headers file at: ${outputPath}`);
}