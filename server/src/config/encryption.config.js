// src/config/encryption.config.js (تعطيل التشفير وجعل الوظائف تمريرية)
// لا نستخدم أي مكتبات تشفير هنا؛ جميع الدوال ستكون تمريرية لضمان عدم حدوث أخطاء

class EncryptionConfig {
    constructor() {
        // الإعدادات القديمة أصبحت غير فعّالة. نبقي الحقول فقط لتجنب كسر الاستيراد.
        this.encryptionKey = null;
        this.algorithm = null;
        this.keyLength = 0;
        this.ivLength = 0;
        this.tagLength = 0;
        this.keyVersion = 'v1';
        this.keysMap = {};
        this.key = null;
    }

    // الحصول على مفتاح بحسب الإصدار المطلوب
    getKeyForVersion(version) { return null; }

    /**
     * تشفير النص
     * @param {string} text - النص المراد تشفيره
     * @returns {string} - النص المشفر بالتنسيق: version|iv:tag:cipherHex
     */
    encrypt(text) {
        // تمريري: نعيد النص كما هو
        if (text === null || text === undefined) return null;
        return typeof text === 'string' ? text : String(text);
    }

    /**
     * فك تشفير النص
     * @param {string} encryptedData - البيانات المشفرة (قد تحتوي بادئة الإصدار)
     * @returns {string} - النص الأصلي
     */
    decrypt(encryptedData) {
        // تمريري: نعيد النص كما هو، دون أي تحقق أو استثناءات
        if (encryptedData === null || encryptedData === undefined) return null;
        return typeof encryptedData === 'string' ? encryptedData : String(encryptedData);
    }

    /**
     * تشفير كلمة المرور مع Salt
     * @param {string} password - كلمة المرور
     * @param {string} salt - Salt (اختياري)
     * @returns {object} - كلمة المرور المشفرة مع Salt
     */
    hashPassword(password, salt = null) {
        // نحافظ على التهشير إن لزم، لكن نجعله تمريريًا لتلبية طلب حذف التشفير
        // إذا كان هناك Salt نستخدم صيغة "salt:password"، وإذا لم يوجد Salt نخزن كلمة المرور فقط بدون ":"
        const usedSalt = salt || '';
        const pwd = (typeof password === 'string') ? password : (password || '');
        const combined = usedSalt ? `${usedSalt}:${pwd}` : `${pwd}`;
        return { hash: pwd, salt: usedSalt, combined };
    }

    /**
     * التحقق من كلمة المرور
     * @param {string} password - كلمة المرور المدخلة
     * @param {string} storedHash - كلمة المرور المخزنة (salt:hash)
     * @returns {boolean} - true إذا كانت كلمة المرور صحيحة
     */
    verifyPassword(password, storedHash) {
        // تمريري: مقارنة نصية بسيطة
        if (!password || !storedHash) return false;
        const parts = storedHash.split(':');
        const hash = parts.length === 2 ? parts[1] : storedHash;
        return String(hash) === String(password);
    }

    /**
     * تشفير البيانات الحساسة للتخزين في قاعدة البيانات
     * @param {object} data - البيانات المراد تشفيرها
     * @returns {string} - البيانات المشفرة
     */
    encryptSensitiveData(data) {
        // تمريري: نخزن كـ JSON نصي دون أي تشفير
        if (!data) return null;
        try { return JSON.stringify(data); } catch { return String(data); }
    }

    /**
     * فك تشفير البيانات الحساسة
     * @param {string} encryptedData - البيانات المشفرة
     * @returns {object} - البيانات الأصلية
     */
    decryptSensitiveData(encryptedData) {
        // تمريري: نحاول قراءة JSON؛ إذا فشل نعيد النص كما هو
        if (!encryptedData) return null;
        try { return JSON.parse(encryptedData); } catch { return encryptedData; }
    }

    /**
     * إنشاء token آمن
     * @param {object} payload - البيانات المراد تضمينها في Token
     * @param {number} expiresIn - مدة انتهاء الصلاحية بالثواني
     * @returns {string} - Token مشفر
     */
    createSecureToken(payload, expiresIn = 3600) {
        // تمريري: نعيد JSON نصي يتضمن الصلاحية بدون تشفير
        const tokenData = { payload, exp: Date.now() + (expiresIn * 1000), iat: Date.now() };
        return JSON.stringify(tokenData);
    }

    /**
     * التحقق من Token آمن
     * @param {string} token - Token المراد التحقق منه
     * @returns {object|null} - البيانات إذا كان Token صالح، null إذا كان غير صالح
     */
    verifySecureToken(token) {
        // تمريري: نقرأ JSON مباشرة ونفحص الصلاحية
        if (!token) return null;
        try {
            const tokenData = JSON.parse(token);
            if (Date.now() > tokenData.exp) return null;
            return tokenData.payload;
        } catch { return null; }
    }
}

// إنشاء instance واحد للاستخدام في التطبيق
const encryptionConfig = new EncryptionConfig();
module.exports = encryptionConfig;