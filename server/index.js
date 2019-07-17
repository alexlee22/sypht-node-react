const fs = require('fs');
const path = require('path');

const express = require('express')
const cors = require('cors')
const app = express()
app.use(cors())
const port = 3000

const request = require('request');
const multer  = require('multer')
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' +file.originalname )
    }
})
var upload = multer({ storage: storage }).single('file')


const clientID = "<CLIENTID>";
const clientSecret = "<CLIENTSECRET>";



//mongodb
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/sypht', {useNewUrlParser: true});
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  // we're connected!
});

/*
var invoiceSchema = new mongoose.Schema({
    fileId: String,
    timestamp: String,
    total: String,
    amountPaid: String,
    tax: String,
    gst: String,
    amountDue: String,
    subTotal: String,
    supplierABN: String
});
*/


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

//Upload file to Sypht server
function uploadSypht(access_token, filePath) {
    let options = {
        url:'https://api.sypht.com/fileupload',
        formData: {
            fileToUpload: fs.createReadStream(path.join(__dirname, filePath)),
            //fieldSets:JSON.stringify(['sypht.invoice','sypht.document'])
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

//Download Sypht data
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
            for (let i = 0; i < body.results.fields.length; i++) { //array.reduce instead?
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

//- - - - - - - - - 



function uploadFile(req, res){
    return new Promise((resolve, reject) => {
        upload(req, res, (err) => {
            resolve(req.file)
        });
    })
}



//POST: Image to server then Sypht
async function uploadImage(req, res) {
    var auth = await authenticateSypht()
    var file = await uploadFile(req, res)
    var uploadResult = await uploadSypht(auth, file.path)
    
    //Insert into MongoDB
    var makeSave = new Invoice({
        fileId: uploadResult.fileId,
        status: uploadResult.status,
        uploadedAt: Date.parse(uploadResult.uploadedAt),
        data: {}
    });
    makeSave.save(function (err) {
        if (err) return handleError(err);
        res.send(uploadResult)
    });
}


//GET: List of incoices
async function getInvoicesList(req, res){
    var getInvoices = await Invoice.find(function (err, invoices) {
        if (err) return console.error(err);
        return invoices;
    })    
    
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

function searchDB(fileId){
    return new Promise((resolve, reject) => {
        Invoice.find({ 'fileId': fileId }, function (err, invoices) {
            if (err) return console.error(err);
            resolve(invoices[0])
        })
    })
}

function updateDocument (fileId, data) {

}


//GET: One invoice
async function getSpecificInvoices(req, res){
    if (req.query.fileId != undefined){
        var getInvoiceData = await searchDB(req.query.fileId);
        if (getInvoiceData.status === "RECEIVED"){
            var auth = await authenticateSypht()
            var result = await downloadInvoice(auth, req.query.fileId);

            //replace new data
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



app.get('/', (req, res) => res.send('Hello World!'));
app.get('/invoiceslist', (req, res) => getInvoicesList(req, res));
app.get('/invoicedata', (req, res) => getSpecificInvoices(req, res));
app.post('/uploadImage', (req, res) => uploadImage(req, res));

app.listen(port, () => console.log(`Example app listening on port ${port}!`))