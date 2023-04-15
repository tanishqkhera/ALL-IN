const { promisify } = require('util');
const axios = require("axios");
const exec = promisify(require('child_process').exec);
const fs = require('fs');
const FormData = require('form-data');
const http = require('http');
const { Client } = require("elasticsearch");
const elasticUrl = "http://elasticsearch:9200";
const elasticsearch = require('elasticsearch');
const express = require('express');
const app = express();
const ejs = require('ejs');

app.set('view engine', 'ejs'); // set the view engine to use EJS
app.use(express.static('public')); // serve static files from the public directory

const inputVideoFile = './Database/test.webm';
const outputAudioFile = './audio.mp3';
const client = new elasticsearch.Client({
  host: 'http://localhost:9200' 
});

const command = `ffmpeg -i ${inputVideoFile} -vn -acodec libmp3lame -b:a 128k ${outputAudioFile}`;

app.get('/', async (req, res) => {
  try {
    const { stdout, stderr } = await exec(command);
    console.log(`FFmpeg output: ${stdout}`);
    console.error(`FFmpeg error output: ${stderr}`);

    const form = new FormData();
    form.append('audio_file', fs.createReadStream(outputAudioFile), { filename: 'audio.mp3' });

    const requestOptions = {
      hostname: 'localhost',
      port: 9000,
      path: '/asr',
      method: 'POST',
      headers: form.getHeaders()
    };

    const response = await new Promise((resolve, reject) => {
      const request = http.request(requestOptions, (response) => {
        response.on('error', reject);

        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          resolve(data);
        });
      });

      request.on('error', reject);
      form.pipe(request);
    });

    console.log(response);

    const result = await client.index({
      index: 'image',
      body: {
        audio_data: response
      },
      refresh: 'true'
    });

    const imageFile = './bit.png'; // replace with your image file
    const contentType = 'image/png'; // replace with your image content type

    // Convert image file to buffer
    const imageBuffer = fs.readFileSync(imageFile);

    // Create FormData object with image buffer
    const formData = new FormData();
    formData.append('image', imageBuffer, {
      filename: imageFile,
      contentType: contentType
    });

    // Send HTTP POST request to predict API
    const responseImage = await axios.post('http://localhost:5000/model/predict', formData, {
      headers: formData.getHeaders()
    });

    // Log the response data to console
    console.log(responseImage.data);

    console.log(`Data indexed: ${JSON.stringify(result)}`);

    // Render the response display view with the response data
    res.render('home', { response });
   
  } catch (error) {
    console.error(`Error: ${error.message}`);
    res.send(`Error: ${error.message}`);
  } finally {
    fs.unlink(outputAudioFile, (err) => {
      if (err) {
        console.error(`Error deleting file: ${err}`);
      } else {




  fs.unlink(outputAudioFile, (err) => {
      if (err) {
        console.error(`Error deleting file: ${err}`);
      } else {
javascript
    console.log('Output audio file deleted.');
  }
});

  console.log('Output audio file deleted.');
  }
});
}
});

app.listen(7000, () => {
console.log('Server listening on port 7000');
});
