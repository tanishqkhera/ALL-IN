const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { Client } = require("elasticsearch");
// const elasticUrl = "http://localhost:9200";
//const elasticUrl = "http://host.docker.internal:9200";
 const elasticUrl = "http://elasticsearch:9200";
const multer = require('multer');
const ejs = require('ejs')
const esclient   = new Client({ node: elasticUrl });
const elasticsearch = require('elasticsearch');
const path = require("path")

const mime = require('mime-types');
const pdf2img = require("pdf-img-convert");

const directoryPath = path.join(__dirname, 'database');
const fileType = mime.lookup(directoryPath)
const directoryPathImage = path.join(__dirname, 'ayush'); 
const app = express();

const client = new elasticsearch.Client({
     host: 'http://localhost:9200' 
});

app.use(express.json())
app.use(express.urlencoded({extended: true}))
app.set('views', 'views');
app.set('view engine', 'ejs');

// Set up Multer for file upload
app.use(express.static('public'))

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'database/');
  },
  filename: function(req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

app.get('/', (req, res) => {
  res.render('home');
})

app.get("/load", (req, res) => {
  res.render("load", {indexedFiles});
})

app.get('/database/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  const file = path.join(__dirname, 'database', fileName);
  
  fs.readFile(file, (err, data) => {
    if (err) {
      console.log(err);
      res.status(404).send('File not found');
    } else {
      const fileExtension = path.extname(fileName).toLowerCase();
      let contentType = '';
      switch (fileExtension) {
        case '.pdf':
          contentType = 'application/pdf';
          break;
        case '.docx':
          contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          break;
        case '.txt':
          contentType = 'text/plain';
          break;
        case '.csv':
          contentType = 'text/csv';
          break;
        case '.jpeg':
        case '.jpg':
          contentType = 'image/jpeg';
          break;
        case '.png':
          contentType = 'image/png';
          break;
        default:
          contentType = 'application/octet-stream';
          break;
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      res.send(data);
    }
  });
});

app.get("/index", (req, res) => {
  res.render("index", {indexedFiles});
})


app.get('/test', async (req, res) => {
  const q = req.query.q;
  
  if (q) {
    try {
      const results = await client.search({
        index: 'image',
        body: {
          query: {
            match: {
              text: q
            }
          }
        }
      });
      const result = results.hits.hits[0];
      console.log(result);
      const fileName = result._source.file_name;
      const fileSymbol = result._source.file_logo;
      const fileType = result._source.fileType;
      // const lastModified = result._source.lastModified;
      // const fileSize = result._source.fileSize;
      res.render('test', { q, fileName, fileSymbol, fileType });
    } catch (error) {
      console.error(error);
      res.status(500).send('Error searching for documents.');
    }
  } else {
    res.render('test', { q });
  }
});




let indexedFiles = [];
let docs = [];
let intervalId;
let results;
app.post('/upload', upload.single('file'), (req, res) => {
  // setInterval(async () => {
  try {
    const filePath = path.join(__dirname, 'database', req.file.originalname);
    const fileType = mime.lookup(filePath);
    const directoryPathImage = path.join(__dirname, 'database');

let fileLogo = '';

    switch (fileType) {
      case 'application/pdf':
        fileLogo = 'pdf.png';
        break;
      case 'application/msword':
        fileLogo = 'word.png';
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        fileLogo = 'word.png';
        break;
       default:
        fileLogo = 'file.png';
        break;
}
   if (fileType === 'application/pdf') {
        pdf2img.convert(filePath, {outputdir: directoryPathImage}).then(async (result) => {
            for (let i = 0; i <result.length; i++) {
                 const pngFile = `${path.basename(filePath, '.pdf')}_${i}.png`;
          const pngFilePath = path.join(directoryPathImage, pngFile);
          
          await fs.promises.writeFile(pngFilePath, result[i]);

          axios({
            method:'put',
            // url: "http://host.docker.internal:9998/tika",
            url: "http://localhost:9998/tika",
            data: fs.createReadStream(pngFilePath),
             headers: {
              'Content-Type': mime.lookup(pngFilePath),
              Accept: 'text/plain',
              'X-Tika-OCRLanguage': 'eng',
            },
          })
            .then(async (response) => {
                const textData = response.data;

                axios({
                    method: 'put',
                    url: 'http://localhost:9998/meta',
                    data: fs.createReadStream(filePath),
                    headers: {
                        'Content-Type': 'application/octet-stream',
                    },
                })
                .then(async (metaResponse) => {
                    const metaData = metaResponse.data;
                    const result = await client.index({
                        index: 'image',
                        id: pngFile,
                        body: {
                            text: textData,
                            meta: metaData,
                            fileType: fileType,
                            file_name: req.file.originalname,
                            file_logo: fileLogo,
                        },
                        refresh: 'true'
                    });

                    console.log(`Data indexed: ${JSON.stringify(result)}`);
                    

                    indexedFiles.push({
                        text: textData,
                        meta: metaData,
                        fileName: req.file.originalname,
                        fileType: fileType,
                        fileLogo: fileLogo
                    });
                    console.log(indexedFiles);
 
                    res.redirect("/load");
                })
                .catch(err => {
                    console.log(err);
                })
            })
            }
        })
    }  else {
      axios({
        method: 'put',
           url: 'http://localhost:9998/tika',
          //url: 'http://host.docker.internal:9998/tika',
        data: fs.createReadStream(filePath),
        headers: {
          'Content-Type': fileType,
          Accept: 'text/plain',
          'X-Tika-OCRLanguage': 'eng',
        },
      })
        .then(async (response) => {
                const textData = response.data;

                axios({
                    method: 'put',
                    //url: 'http://host.docker.internal:9998/meta',
                    url: 'http:localhost:9998/meta',
                    data: fs.createReadStream(filePath),
                    headers: {
                        'Content-Type': 'application/octet-stream',
                    },
                })
                .then(async (metaResponse) => {
                    const metaData = metaResponse.data;
                    const result = await client.index({
                        index: 'image',
                        id: req.file.originalname,
                        body: {
                            text: textData,
                            meta: metaData,
                            fileType: fileType,
                            file_name: req.file.originalname,
                            file_logo: fileLogo,
                        },
                        refresh: 'true'
                    });

                    console.log(`Data indexed: ${JSON.stringify(result)}`);
                    

                    indexedFiles.push({
                        text: textData,
                        meta: metaData,
                        fileName: req.file.originalname,
                        fileType: fileType,
                        fileLogo: fileLogo
                    });
                    res.redirect("/load")
                    console.log(indexedFiles);
                    fs.readFile('./metadata.json', (err, data) => {
  if (err) {
    console.error(err);
    return;
  }

  const metadata = JSON.parse(data);
  console.log(metadata);
});
                
                })
                .catch(err => {
                    console.log(err);
                })
            })
   
}
  
  } catch (error) {
    console.error('Error:', error);
    console.log('Unable to upload file');
  }
    //  }, 10000)
     
});


// clear the interval when the app is closed
app.on("close", () => {
  clearInterval(intervalId);
});
const PORT= 3004
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});





