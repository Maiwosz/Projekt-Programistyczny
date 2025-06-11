const fs = require('fs');
const path = require('path');

class HTTPLogger {
    constructor(options = {}) {
        this.enabled = options.enabled !== false;
        this.logToFile = options.logToFile || false;
        this.logFilePath = options.logFilePath || './logs/http.log';
        this.excludePaths = options.excludePaths || ['/health', '/favicon.ico'];
        this.sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
        
        if (this.logToFile) {
            const logDir = path.dirname(this.logFilePath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        }
    }

    shouldLog(req) {
        if (!this.enabled) return false;
        return !this.excludePaths.some(path => req.path.includes(path));
    }

    sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        this.sensitiveHeaders.forEach(header => {
            if (sanitized[header]) {
                sanitized[header] = '[REDACTED]';
            }
        });
        return sanitized;
    }

    log(message) {
        console.log(message);
        
        if (this.logToFile) {
            try {
                fs.appendFileSync(this.logFilePath, `${message}\n`);
            } catch (error) {
                console.error('Log file write error:', error);
            }
        }
    }

    middleware() {
        return (req, res, next) => {
            if (!this.shouldLog(req)) {
                return next();
            }
            
            // Logowanie żądania
            const requestPayload = req.body ? JSON.stringify(req.body) : 'brak payload';
            this.log(`Żądanie: ${req.method} ${req.path} | Payload: ${requestPayload}`);
            
            // Przechwytywanie response body
            const originalSend = res.send;
            const originalJson = res.json;
            let responseBody = null;
            
            res.send = function(body) {
                responseBody = body;
                return originalSend.call(this, body);
            };
            
            res.json = function(body) {
                responseBody = body;
                return originalJson.call(this, body);
            };
            
            res.on('finish', () => {
                // Logowanie odpowiedzi
                const responsePayload = responseBody ? JSON.stringify(responseBody) : 'brak payload';
                this.log(`Odpowiedź: ${res.statusCode} | Payload: ${responsePayload}`);
                this.log('='.repeat(50));
            });
            
            next();
        };
    }
}

module.exports = HTTPLogger;