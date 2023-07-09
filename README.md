<p align="center">
  <a href="https://github.com/dreamup-ai/job-monitor/actions/workflows/run-job-monitor.yaml"><img src="https://img.shields.io/github/actions/workflow/status/dreamup-ai/job-monitor/run-job-monitor.yaml?label=run-job-monitor&logo=github&style=plastic" alt="github workflow status"></a>
</p>

# job-monitor

## Overview

This is a scheduled GitHub Actions workflow that monitor the jobs execution. It submits a job using active models and fetch its status until completed.

## Development

Make a copy of the .env.template file and name it .env, then run:

``` bash
npm run dev
```