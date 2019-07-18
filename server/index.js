/*
- - - - - - - - - -
DEPENDENCIES
- - - - - - - - - -
*/

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
const request = require('request');
const multer  = require('multer'); // for uploading file
const mongoose = require('mongoose');


/*
- - - - - - - - - -
VARIABLES
- - - - - - - - - -
*/

// Sypht private keys <Don't Upload>
const clientID = "<CLIENTID>";
const clientSecret = "<CLIENTSECRET>";
const port = 3000;
const mongoDBAddress = 'mongodb://localhost:27017/sypht';


// Prep Multer
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' +file.originalname )
    }
})
var upload = multer({ storage: storage }).single('file')


// Set up MongoDB
mongoose.connect(mongoDBAddress, {useNewUrlParser: true});
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
    console.log("Connected to MongoDB!")
});

var invoiceSchema = new mongoose.Schema({
    fileId: String,
    status: String,
    uploadedAt: Date,
    data: {
        total: Number,
        dueDate: Date,
        purchaseOrderNo: Number,
        amountPaid: Number,
        tax: Number,
        gst: Number,
        amountDue: Number,
        subTotal: Number
    }
});
const Invoice = mongoose.model('invoice', invoiceSchema);


/*
- - - - - - - - - -
FUNCTIONS
- - - - - - - - - -
*/

// Authenticate to the Sypht server
// Returns `access_token` required to access the server
function authenticateSypht() {
    let options = {
        url:'https://login.sypht.com/oauth/token',
        body:{
            client_id: clientID,
            client_secret: clientSecret,
            audience: "https://api.sypht.com",
            grant_type: "client_credentials"
        },
        headers:{
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        json:true
      }

    return new Promise((resolve, reject) => {
        request.post(options, (error, response, body) => {
            resolve(body.access_token);
        })
    })
}


// Upload file to Sypht server
// Requires authenticated and file path on server
function uploadToSypht(access_token, filePath) {
    let options = {
        url:'https://api.sypht.com/fileupload',
        formData: {
            fileToUpload: fs.createReadStream(path.join(__dirname, filePath)),
            fieldSets:JSON.stringify(['sypht.invoice'])
        },
        headers:{
                'Authorization': 'Bearer ' + access_token
        },
        json:true
    }

    return new Promise((resolve, reject) => {
        request.post(options, (error, response, body) => {
            resolve(body);
        })
    })
}


// Download data of a file from Sypht
// Uses a fileId and access_token from auth
function downloadInvoice(access_token, fileId) {
    let options = {
        url:'https://api.sypht.com/result/final/' + fileId,
        headers:{
            'Authorization': 'Bearer ' + access_token
        },
        json:true
    }

    return new Promise((resolve, reject) => {
        request.get(options, (error, response, body) => {
            var returnDict = {}
            //Get value if not null
            for (let i = 0; i < body.results.fields.length; i++) { //note: array.reduce instead?
                let splitName = body.results.fields[i].name.split('.')
                if (body.results.fields[i].value !== null) {
                    returnDict[splitName[1]] = Number(body.results.fields[i].value)
                } else {
                    returnDict[splitName[1]] = null
                }
            }
            resolve(returnDict);
        })
    })
}

// Upload file to server at the location
// Uses multer
function uploadFileToServer(req, res){
    return new Promise((resolve, reject) => {
        upload(req, res, (err) => {
            resolve(req.file)
        });
    })
}

// Search and receive the fileId document from the MongoDB
// Return: dict
function searchDB(fileId){
    return new Promise((resolve, reject) => {
        Invoice.find({ 'fileId': fileId }, function (err, invoices) {
            if (err) return console.error(err);
            resolve(invoices[0])
        })
    })
}

// TODO: Update document in MongoDB
function updateDocument (fileId, data) {

}


/*
- - - - - - - - - -
VARIABLES
- - - - - - - - - -
*/

// POST: Image to server then Sypht
// Return: fileId and Name
async function uploadImage(req, res) {

    var auth = await authenticateSypht()
    var file = await uploadFileToServer(req, res)
    var uploadResult = await uploadToSypht(auth, file.path)
    
    // Insert into MongoDB
    var makeSave = new Invoice({
        fileId: uploadResult.fileId,
        status: uploadResult.status,
        uploadedAt: Date.parse(uploadResult.uploadedAt),
        data: {}
    });

    // Return after save
    makeSave.save(function (err) {
        if (err) return handleError(err);
        res.send(uploadResult)
    });
}


// GET: List of invoices from MongoDB
// Return: list dict of a compiled name and fileId
async function getInvoicesList(req, res){
    var getInvoices = await Invoice.find(function (err, invoices) {
        if (err) return console.error(err);
        return invoices;
    })    
    
    // Make a list dict for name and fileId
    var invoiceNames = getInvoices.map((inv) => {
        return ({
            'name': inv.uploadedAt + ' - ' + inv.fileId,
            'fileId': inv.fileId
        })
    })
    
    res.send({
        'data': invoiceNames
    })
}


// GET: specific invoice data
// Return: data from MongoDB and/or Sypht
async function getSpecificInvoices(req, res){
    if (req.query.fileId != undefined){
        var getInvoiceData = await searchDB(req.query.fileId);
        
        // If have not gotten data from Sypht, get and update
        if (getInvoiceData.status === "RECEIVED"){
            var auth = await authenticateSypht()
            var result = await downloadInvoice(auth, req.query.fileId);

            getInvoiceData.status = "FINALISED";
            getInvoiceData.data = result
            //UpdateDB: updateDocument()
        }
        
        res.send({
            'data': getInvoiceData
        })
    
    } else{
        res.send({
            'error':'no value found'
        })
    }
}


/*
- - - - - - - - - -
ROUTES
- - - - - - - - - -
*/

app.get('/', (req, res) => res.send('Hello World!'));

// Returns list of data list with `date` and `fileId`
app.get('/invoiceslist', (req, res) => getInvoicesList(req, res));
// Returns data of `fileId`
app.get('/invoicedata', (req, res) => getSpecificInvoices(req, res));
// Uploads image to server and Sypht
app.post('/uploadImage', (req, res) => uploadImage(req, res));

app.listen(port, () => console.log(`Example app listening on port ${port}!`))