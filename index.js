import axios from 'axios'
import { generateIdToken } from './cognitoAuth.js'
import { createLogger, format, transports } from 'winston'

const API_ENDPOINT = process.env.API_ENDPOINT
const LOG_LEVEL = process.env.LOG_LEVEL
const TIMEOUT_SECONDS = process.env.TIMEOUT_SECONDS
const WAIT_SECONDS = process.env.WAIT_SECONDS
const QUEUED_TIMEOUT_SECONDS = process.env.QUEUED_TIMEOUT_SECONDS

// Logging
const logger = createLogger({
  level: LOG_LEVEL,
  format: format.combine(format.splat(), format.simple()),
  transports: [new transports.Console()]
})

const getSDModels = async (idToken) => {
  let params = {
    method: 'get',
    url: `${API_ENDPOINT}/models`,
    params: {
      loaded: true
    },
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  }
  return axios(params)
}

const submitJob = async (model, idToken) => {
  let params = {
    method: 'post',
    url: `${API_ENDPOINT}/job`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    data: {
      model: model,
      params: {
        width: 512,
        guidance_scale: 7.5,
        height: 512,
        num_inference_steps: 50
      },
      prompt: 'dog flying sky 4k front view'
    }
  }
  return axios(params)
}

const getJobStatus = async (jobId, idToken) => {
  let params = {
    method: 'get',
    url: `${API_ENDPOINT}/job/${jobId}`,
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  }
  return axios(params)
}

// start the job
const startJob = async () => {
  let idToken = ''

  // get the access token
  try {
    idToken = await generateIdToken()
  } catch (err) {
    throw new Error(`{ "error": "Failed to get the id token from cognito","errorMessage": "${err.message}" }`)
  }

  // get the models
  let responseModels = ''
  let models = ''

  try {

    responseModels = await getSDModels(idToken)

    models = responseModels.data

  } catch (err) {
    throw new Error(`{ "error": "Failed to get SD models","errorMessage": "${err.message}" }`)
  }

  // for each id in models, add to array
  let processedModels = []
  let randomModel = ''

  if (models.length > 0 && models) {
    for (let model of models) {
      processedModels.push(model.id)
    }

    logger.debug(`processedModels: ${JSON.stringify(processedModels)}`)

    // pick a random model from the array
    randomModel =
      processedModels[Math.floor(Math.random() * processedModels.length)]

    logger.debug(`randomModel: ${randomModel}`)
  } else {
    throw new Error(`{ "error": "No models found" }`)
  }

  // submit the job
  let responseJob = ''
  let jobId = ''
  let startTime = ''

  try {
    responseJob = await submitJob(randomModel, idToken)

    jobId = responseJob.data.job_id
    startTime = Date.now()

    logger.info(`{ "message": Job submitted successfully,"jobId": "${responseJob.data.job_id}","model": "${randomModel}" }`)

  } catch (err) {
    throw new Error(`{ "error": Failed to submit the job,"errorMessage": "${err.message}" }`)
  }

  let jobCompleted = false
  let jobFailed = false
  let queuedTime = 0
  let runningTime = 0
  let jobTime = 0
  let elapsedTime = 0

  // get the job status
  while (!jobCompleted && !jobFailed) {

    const timeout = TIMEOUT_SECONDS * 1000
    const queuedTimeout = QUEUED_TIMEOUT_SECONDS * 1000

    let responseGetJobStatus = ''
    let jobStatus = ''

    try {

      responseGetJobStatus = await getJobStatus(jobId, idToken)
      
      jobStatus = responseGetJobStatus.data.status

    } catch (err) {
      throw new Error(`{ "error": Failed to get job status,"errorMessage": "${err.message}" }`)
    }

    if (jobStatus === 'queued') {

      elapsedTime = Date.now() - startTime
      
      if (elapsedTime >= queuedTimeout) {

        throw new Error(
          `{ "error": Job hasn't started after ${
            queuedTimeout / 1000
          } secs,"jobId": ${jobId},"model":"${randomModel}" }`
        )
      }
    } else if (jobStatus === 'running' && !queuedTime) {

      queuedTime = Date.now() - startTime

    } else if (jobStatus === 'completed') {

      jobCompleted = true

      runningTime = (Date.now() - startTime - queuedTime) / 1000

      jobTime = (Date.now() - startTime) / 1000

      logger.info(`{ "message": "Job completed successfully","queued_time": ${queuedTime / 1000},"running_time": ${runningTime},"job_time": ${jobTime},"model": "${randomModel}" }`)

    } else if (jobStatus === 'failed') {

      jobFailed = true

      throw new Error(
        `{ "error": Job failed,"jobId": "${jobId}","model":"${randomModel}","queued_time": ${queuedTime / 1000},"running_time": ${runningTime} }`
      )
    } else {

      elapsedTime = Date.now() - startTime

      if (elapsedTime >= timeout) {

        runningTime = (Date.now() - startTime - queuedTime) / 1000

        jobTime = (Date.now() - startTime) / 1000

        throw new Error(
          `{ "error": Job took longer than ${timeout / 1000} secs to complete,"current_status": "${jobStatus}","jobId": "${jobId}","model":"${randomModel}","queued_time": ${queuedTime / 1000},"running_time": ${runningTime} }`
        )
      }
    }
    if (jobStatus !== 'completed' && jobStatus !== 'failed') {

      logger.debug(
        `Job ${jobId} still running - current status: ${jobStatus} - Trying again in 1 sec...`
      )

      const waitTime = WAIT_SECONDS * 1000

      await new Promise((resolve) => setTimeout(resolve, waitTime)) // Wait for 1 second
  
      continue
    }
  }
}

startJob()
