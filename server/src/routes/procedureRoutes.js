// src/routes/procedureRoutes.js
const express = require('express');
const router = express.Router();
const procedureController = require('../controllers/procedureController');

router.get('/', procedureController.getAllProcedures);
router.post('/', procedureController.createProcedure);
router.get('/:id', procedureController.getProcedureById);

// --- استخدام اسم الدالة الصحيح هنا ---
router.get('/:id/subtasks', procedureController.getProcedureSubtasks);
// PUT /api/procedures/1  (لتحديث مهمة)
router.put('/:id', procedureController.updateProcedure);

// DELETE /api/procedures/1 (لحذف مهمة)
router.delete('/:id', procedureController.deleteProcedure);

module.exports = router;