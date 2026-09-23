process.env.PORT = process.env.PORT || '8084';
process.env.SERVICE_NAME = 'Live Bidding Platform';
process.env.CLIENT_FILE = '../clients/bidding.html';
process.env.EVENT_LABEL = 'bid-update';
require('../service-server');
