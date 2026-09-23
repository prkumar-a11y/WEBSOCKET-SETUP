process.env.PORT = process.env.PORT || '8082';
process.env.SERVICE_NAME = 'E-Commerce Live Updates';
process.env.CLIENT_FILE = '../clients/ecommerce.html';
process.env.EVENT_LABEL = 'product-update';
process.env.EVENT_TYPES = 'inventory,price-drop,order-status';
require('../service-server');
