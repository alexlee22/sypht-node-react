import React, { Component } from 'react';
import axios from 'axios';
import { SERVER_ADDRESS } from './const'

class Displayer extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedFile: null,
            isUploading: false,
            hasUploaded: false,
            invoiceList: [],
            choice: '',
            isFetchInvoice: false,
            data: null
        }
    };

    // Fetch invoice list on start
    componentDidMount = () => {
        fetch(SERVER_ADDRESS + '/invoicesList')
        .then(res => res.json())
        .then(data => {
            this.setState({ invoiceList: data.data });
        });
    }

    // Set on dropdown selection
    handleSelectChange = (e) => {
        this.setState({ choice: e.target.value, data: null});
        this.getInvoiceData(e.target.value);
    }

    // GET invoice data from server
    getInvoiceData = (invoiceId) => {
        this.setState({ isFetchInvoice: true });
        fetch(SERVER_ADDRESS + '/invoicedata?fileId=' + invoiceId)
        .then(res => res.json())
        .then(data => {
            this.setState({ data: data.data, isFetchInvoice: false });
        });
    }

    // Handle selection for file options (message and file)
    handleUploadChange = (e) => {
        this.setState({
            selectedFile: e.target.files[0],
            isUploading: false,
            hasUploaded: false
        });
    }

    // Upload file to node server
    uploadFile = (e) => {
        this.setState({ isUploading: true });
        const dataFile = new FormData();
        dataFile.append('file', this.state.selectedFile);
        
        axios.post(SERVER_ADDRESS + 'uploadImage', dataFile, {
        }).then(res => {
            //Adds list to dropdown data menu (so it can be selected)
            let getInvoiceList = this.state.invoiceList;
            getInvoiceList.push({
                'name': res.data.uploadedAt + ' - ' + res.data.fileId,
                'fileId': res.data.fileId
            });
            // Set data and toggle status
            this.setState({ invoiceList: getInvoiceList, isUploading: false, hasUploaded: true });
        })
    }
    

    render() {
        const { invoiceList, isUploading, hasUploaded, choice, isFetchInvoice, data } = this.state;
        console.log(data)
        return (
            <section id='content'>
                <div id="selector">
                    <h2> Pick an invoice</h2>
                    { invoiceList &&
                    <select onChange={this.handleSelectChange} value={choice}>
                        <option key='0' value=''>Pick an invoice</option>
                        { invoiceList.map((d, idx) => {
                            return(
                                <option key={d.fileId} value={d.fileId}>
                                    {d.name}
                                </option>
                            )
                        }) }
                    </select>
                    }
                </div>
                <div id="results">
                    { isFetchInvoice &&
                        <h3>Fetching.....</h3>
                    }
                    { data &&
                        <React.Fragment>
                            <h3>Results</h3>
                            <p>uploadedAt: {data.uploadedAt ? data.uploadedAt : "n/a" }</p>
                            <p>amountDue: {data.data.amountDue ? data.data.amountDue : "n/a" }</p>
                            <p>amountPaid: {data.data.amountPaid ? data.data.amountPaid : "n/a" }</p>
                            <p>dueDate: {data.data.dueDate ? data.data.dueDate : "n/a" }</p>
                            <p>gst: {data.data.gst ? data.data.gst : "n/a" }</p>
                            <p>purchaseOrderNo: {data.data.purchaseOrderNo ? data.data.purchaseOrderNo : "n/a" }</p>
                            <p>subTotal: {data.data.subTotal ? data.data.subTotal : "n/a" }</p>
                            <p>tax: {data.data.tax ? data.data.tax : "n/a" }</p>
                            <p>total: {data.data.total ? data.data.total : "n/a" }</p>
                        </React.Fragment>
                    }
                </div>
                <div id="uploader">
                    <h2>Upload an invoice</h2>
                    <input type="file" name="file" onChange={this.handleUploadChange}/>
                    <button type="button" onClick={this.uploadFile}>Upload to Sypht</button> 
                    { isUploading &&
                        <p>Uploading.....</p>
                    }
                    { hasUploaded &&
                        <p>Uploaded!</p>
                    }
                </div>
            </section>
        )
    }
}

export default Displayer;