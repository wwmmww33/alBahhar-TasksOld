// src/config/encryption.config.js (تعطيل التشفير وجعل الوظائف تمريرية)
// لا نستخدم أي مكتبات تشفير هنا؛ جميع الدوال ستكون تمريرية لضمان عدم حدوث أخطاء

const crypto = require('crypto');
require('dotenv').config();

class EncryptionConfig {
    constructor() {
        const defaultSecret = 'this is key';
        const secret = process.env.ENCRYPTION_KEY || defaultSecret;
        this.keyVersion = 'v1';
        this.key = crypto.createHash('sha256').update(String(secret)).digest();
    }

    getKeyForVersion(version) {
        if (version === this.keyVersion) return this.key;
        return null;
    }

    encrypt(text) {
        if (text === null || text === undefined) return null;
        const value = typeof text === 'string' ? text : String(text);
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
        const encrypted = Buffer.concat([cipher.update(Buffer.from(value, 'utf8')), cipher.final()]);
        const tag = cipher.getAuthTag();
        const payload = [
            iv.toString('base64'),
            tag.toString('base64'),
            encrypted.toString('base64'),
        ].join(':');
        return `${this.keyVersion}|${payload}`;
    }

    decrypt(encryptedData) {
        if (encryptedData === null || encryptedData === undefined) return null;
        let value = typeof encryptedData === 'string' ? encryptedData : String(encryptedData);
        value = value.trim();
        if (!value) return value;

        const pipeIndex = value.indexOf('|');
        if (pipeIndex === -1) {
            return value;
        }

        const version = value.slice(0, pipeIndex);
        const payload = value.slice(pipeIndex + 1);
        const key = this.getKeyForVersion(version);
        if (!key) {
            return value;
        }

        const parts = payload.split(':');
        if (parts.length !== 3) {
            return value;
        }

        const iv = Buffer.from(parts[0], 'base64');
        const tag = Buffer.from(parts[1], 'base64');
        const encrypted = Buffer.from(parts[2], 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    }

    hashPassword(password, salt = null) {
        const pwd = (typeof password === 'string') ? password : (password || '');
        const encrypted = this.encrypt(pwd);
        return { hash: encrypted, salt: '', combined: encrypted };
    }

    verifyPassword(password, storedHash) {
        if (!password || !storedHash) return false;
        let encrypted = storedHash;
        const parts = storedHash.split(':');
        if (storedHash.indexOf('|') === -1 && parts.length === 2) {
            encrypted = parts[1];
        }
        try {
            const plain = this.decrypt(encrypted);
            return String(plain) === String(password);
        } catch (e) {
            return String(storedHash) === String(password);
        }
    }

    encryptSensitiveData(data) {
        if (!data) return null;
        const json = typeof data === 'string' ? data : JSON.stringify(data);
        return this.encrypt(json);
    }

    decryptSensitiveData(encryptedData) {
        if (!encryptedData) return null;
        const plain = this.decrypt(encryptedData);
        try {
            return JSON.parse(plain);
        } catch (e) {
            return plain;
        }
    }

    createSecureToken(payload, expiresIn = 3600) {
        const tokenData = { payload, exp: Date.now() + (expiresIn * 1000), iat: Date.now() };
        const json = JSON.stringify(tokenData);
        return this.encrypt(json);
    }

    verifySecureToken(token) {
        if (!token) return null;
        try {
            const json = this.decrypt(token);
            const tokenData = JSON.parse(json);
            if (Date.now() > tokenData.exp) return null;
            return tokenData.payload;
        } catch (e) {
            return null;
        }
    }
}

const encryptionConfig = new EncryptionConfig();
module.exports = encryptionConfig;
