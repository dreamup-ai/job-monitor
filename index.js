import axios from 'axios'
import { generateIdToken } from './cognitoAuth.js'
import { createLogger, format, transports } from 'winston'

const API_ENDPOINT = process.env.API_ENDPOINT
const LOG_LEVEL = process.env.LOG_LEVEL
const TIMEOUT_SECONDS = process.env.TIMEOUT_SECONDS
const WAIT_SECONDS = process.env.WAIT_SECONDS
const START_TIMEOUT = process.env.START_TIMEOUT_SECONDS

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
    throw new Error(`Failed to get the id token from cognito - ${err.message}`)
  }

  // get the models
  let responseModels = ''
  let models = ''

  try {

    responseModels = await getSDModels(idToken)

    models = responseModels.data

  } catch (err) {
    throw new Error(`Failed to get SD models - ${err.message}`)
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
    throw new Error('No models found')
  }

  // submit the job
  let responseJob = ''
  let jobId = ''

  try {
    responseJob = await submitJob(randomModel, idToken)

    jobId = responseJob.data.job_id

    logger.info(`Job submitted: ${JSON.stringify(responseJob.data.job_id)} using model ${randomModel}`)
  } catch (err) {
    throw new Error(`Failed to submit the job - ${err.message}`)
  }

  let jobCompleted = false
  let jobFailed = false
  let elapsedTime = ''

  const timeout = TIMEOUT_SECONDS * 1000
  const startTimeout = START_TIMEOUT * 1000
  const startTime = Date.now()

  // get the job status
  while (!jobCompleted && !jobFailed) {

    let responseGetJobStatus = ''
    let jobStatus = ''

    try {

      responseGetJobStatus = await getJobStatus(jobId, idToken)
      
      jobStatus = responseGetJobStatus.data.status
      
    } catch (err) {
      throw new Error(`Failed to get job status - ${err.message}`)
    }

    if (jobStatus === 'completed') {
      jobCompleted = true

      const jobTime = responseGetJobStatus.data.job_time
      const roundedJobTime = jobTime.toFixed(2)

      logger.info(`Job ${jobId} completed in ${roundedJobTime} seconds!`)
    } else if (jobStatus === 'failed') {
      jobFailed = true

      throw new Error(
        `Job ${jobId} failed! - ${JSON.stringify(responseGetJobStatus.data)}`
      )
    } else if (jobStatus === 'queued') {
      elapsedTime = Date.now() - startTime
      if (elapsedTime >= startTimeout) {
        throw new Error(
          `Job ${jobId} using model ${randomModel} took longer than ${startTimeout / 1000} secs to start.`
        )
      }
    } else {
      elapsedTime = Date.now() - startTime
      if (elapsedTime >= timeout) {
        throw new Error(
          `Job ${jobId} using model ${randomModel} took longer than ${timeout / 1000} secs to complete. Current status: ${jobStatus}.`
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
