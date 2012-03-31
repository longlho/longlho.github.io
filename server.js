var express = require('express')
,   app = express.createServer()
,   PORT = 8081;


// Configurations
app.use(express.static(__dirname + '/public', {maxAge : 86400000}));        
app.use(express.bodyParser());        
app.use(express.logger());

console.log("Server running at port " +  PORT);
app.listen(PORT);
