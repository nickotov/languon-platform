import http from 'node:http';

const port = Number(process.env.PORT);
const label = process.env.RELEASE_LABEL;

http.createServer((request, response) => {
    if (request.url === '/stream') {
        response.writeHead(200, {
            'content-type': 'text/plain',
            'cache-control': 'no-cache',
        });
        response.write(`${label}:start\n`);
        setTimeout(() => response.end(`${label}:end\n`), 4000);
        return;
    }
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end(request.url === '/who' ? label : `${label}:health`);
}).listen(port, '0.0.0.0');
