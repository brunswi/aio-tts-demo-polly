/*
* Authentication is disabled for this action
* Make sure to validate this against your security requirements before deploying the action
*/

const { Core } = require('@adobe/aio-sdk')
const { errorResponse, stringParameters, checkMissingRequestInputs } = require('../utils')
const AWS = require('aws-sdk')
const filesLib = require('@adobe/aio-lib-files')
const crypto = require('crypto')


// main function that will be executed by Adobe I/O Runtime
async function main (params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    // 'info' is the default level if not set
    logger.info('Calling the main action')

    // log parameters, only if params.LOG_LEVEL === 'debug'
    logger.debug(stringParameters(params))

    // check for missing request input parameters and headers
    const requiredParams = ['text']
    const requiredHeaders = []
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      // return and log client errors
      return errorResponse(400, errorMessage, logger)
    }
    
    const text = params.text
    // Create an Polly client, see https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html
    const Polly = new AWS.Polly({
      signatureVersion: 'v4',
      region: 'us-east-1',
      accessKeyId: 'insert accessKeyId',
      secretAccessKey: 'insert secretAccessKey'
    })
    // config for tts, 
    // configure voices according to https://docs.aws.amazon.com/polly/latest/dg/voicelist.html
    const pollyVoiceConfig = {
      'Text': text,
      'OutputFormat': 'mp3',
      'VoiceId': 'Joey',
      'Engine': 'neural'
    }
    // config for text marks, 
    // use same VoiceId as in pollyVoiceConfig
    const pollyMarksConfig = {
      'Text': text,
      'OutputFormat': 'json',
      'VoiceId': 'Joey',
      'Engine': 'neural',
      'SpeechMarkTypes': [
        "word"
      ]
    }
    // prepare caching of result in files with @adobe/aio-lib-files
    // see https://github.com/adobe/aio-lib-files
    // and 
    const key = crypto.createHash('md5').update(text).digest('hex')
    const files = await filesLib.init()
    const voicepath = "tts/" + key + "-voice.mp3"
    const markspath = "tts/" + key + "-marks.json"
    const exists = await fileExists(files, voicepath) && fileExists(files, markspath)
    if (!exists) {
      // synthesizeSpeech (voice and marks) and write to file if result for text is not yet cached (fileExists)
      logger.info(`SynthesizeSpeech for text: '${text}'`)
      // see https://docs.aws.amazon.com/polly/latest/dg/API_SynthesizeSpeech.html#API_SynthesizeSpeech_RequestSyntax
      const voice = await Polly.synthesizeSpeech(pollyVoiceConfig).promise()
      const marks = await Polly.synthesizeSpeech(pollyMarksConfig).promise()
      await files.write( voicepath, voice.AudioStream)
      await files.write( markspath, "[" +
        marks.AudioStream.toString('utf8')
          .replace(new RegExp("}\n{","g"), "},{") +
        "]")
    } else {
      logger.info(`Text: '${text}' already processed. Fetch from file: ${voicepath}, ${markspath}`)
    }
    // return urls to request the reults, links will expire in 60 seconds
    const presignVoiceUrl = await files.generatePresignURL(voicepath, { expiryInSeconds: 60 })
    const presignMarksUrl = await files.generatePresignURL(markspath, { expiryInSeconds: 60 })

    const response = {
      statusCode: 200,
      body: {
        voice: presignVoiceUrl,
        marks: presignMarksUrl
      }
    }

    // log the response status code
    logger.info(`${response.statusCode}: successful request`)
    return response
  } catch (error) { 
    // log any server errors
    logger.error(error)
    // return with 500
    return errorResponse(500, 'server error', logger)
  }
}

// check if a file with the given filename exists
async function fileExists(files, path) {
  const list = await files.list(path);
  return list.length && list.length > 0;
}

exports.main = main
