const express = require('express');
const router = express.Router();
const savedProductsController = require('../controllers/savedProductsController');

router.post('/add', savedProductsController.addProduct);
router.post('/remove', savedProductsController.removeProduct);
router.get('/', savedProductsController.listProducts);

module.exports = router;
