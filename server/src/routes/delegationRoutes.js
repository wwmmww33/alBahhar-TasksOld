// src/routes/delegationRoutes.js
const express = require('express');
const router = express.Router();
const delegationController = require('../controllers/delegationController');

// إدارة التفويضات للمستخدم الحالي (كمفوِّض)
router.get('/', delegationController.getDelegations);
router.get('/as-delegate', delegationController.getDelegationsAsDelegate);
router.post('/', delegationController.createDelegation);
router.put('/:id', delegationController.updateDelegation);
router.delete('/:id', delegationController.deleteDelegation);

// إدارة الرمز السري للتفويض
router.get('/secret', delegationController.getDelegationSecret);
router.put('/secret/update', delegationController.updateDelegationSecret);

// سر تفويض محدد (حسب DelegationID)
router.get('/:id/secret', delegationController.getDelegationSecretForDelegation);
router.put('/:id/secret', delegationController.updateDelegationSecretForDelegation);

module.exports = router;
