const fs = require('node:fs')
const path = require('node:path')

function quantile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  if (fraction === 0.5 && sorted.length % 2 === 0) return (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  return sorted[Math.ceil(sorted.length * fraction) - 1]
}
function metrics(sample) {
  const marks = new Map(sample.marks.map((entry) => [entry.name, entry]))
  const duration = (from, to) => marks.has(from) && marks.has(to) ? marks.get(to).at - marks.get(from).at : null
  const completion = marks.get('completed')?.details
  const timings = completion?.timings
  const attempt = completion?.attempt
  return {
    clickToScheduledPlay: duration('click', 'scheduled'),
    clickToLoader: duration('click', 'loaderEnter'),
    clickToStore: duration('click', 'storeEnter'),
    collectionFetch: duration('collectionFetchStart', 'collectionFetchEnd'),
    collectionMainHandler: sample.collectionRequests?.filter((entry) => entry.channel !== 'library:getTracksByPaths').reduce((total, entry) => total + entry.durationMs, 0) ?? 0,
    queuePreparation: duration('storeEnter', 'queuePrepared'),
    pathSnapshots: duration('storeEnter', 'pathsPrepared'),
    queueBuildAndPublication: duration('pathsPrepared', 'queuePublished'),
    queueCleanup: duration('queuePublished', 'queuePrepared'),
    postQueueToLoader: duration('queuePrepared', 'loaderEnter'),
    audioLoadToScheduledPlay: duration('loaderEnter', 'scheduled'),
    clickToLoadingState: duration('click', 'loadingState'),
    clickToFeedbackDom: duration('click', 'feedbackDom'),
    clickToFeedbackFrame: duration('click', 'feedbackFrame'),
    selectedTrackHydration: attempt?.selectedTrackHydrationMs ?? null,
    supersededLoadWait: attempt?.supersededLoadWaitMs ?? null,
    localFilePreflight: timings?.localFilePreflightMs ?? null,
    probe: timings?.probeMs ?? null,
    ffmpeg: timings?.ffmpegMs ?? null,
    audioBufferPreparation: timings?.postDeliveryCommitMs ?? null,
    webAudioBufferAllocation: timings?.webAudioBufferAllocationMs ?? null,
    pcmDeinterleave: timings?.pcmDeinterleaveMs ?? null,
    pcmCommit: timings?.pcmCommitMs ?? null,
    audioPipeline: timings?.standardLoadPipelineMs ?? null,
    loudnessWait: timings?.loudnessMs ?? null,
    queueSharePercent: marks.has('scheduled') ? 100 * duration('storeEnter', 'queuePrepared') / duration('click', 'scheduled') : null
  }
}
function summarize(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')))
  const results = fs.readdirSync(directory).filter((name) => name.endsWith('.result.json')).map((name) => JSON.parse(fs.readFileSync(path.join(directory, name))))
  const failures = results.filter((result) => result.failure).map((result) => ({ name: result.config.name, run: result.config.run, failure: result.failure, completedSamples: result.samples.length }))
  const groups = {}
  for (const config of manifest.cases) {
    const runs = results.filter((result) => result.config.name === config.name && !result.failure)
    const samples = runs.flatMap((result) => result.samples)
    const cold = samples.filter((sample) => sample.kind === 'cold').map(metrics)
    const warm = samples.filter((sample) => sample.kind === 'warm').map(metrics)
    groups[config.name] = {
      config, processes: runs.length, coldCount: cold.length, warmCount: warm.length,
      complete: runs.length === manifest.repetitions && cold.length === manifest.repetitions && warm.length === manifest.repetitions * manifest.warmClicks,
      prebufferInFlightClicks: samples.filter((sample) => sample.marks.find((mark) => mark.name === 'storeEnter')?.details.prebufferInFlight).length,
      prebufferReadyClicks: samples.filter((sample) => sample.before.hasNextBuffered).length,
      missingMetadataCounts: [...new Set(samples.map((sample) => sample.marks.find((mark) => mark.name === 'pathsPrepared')?.details.missingCount))],
      feedbackDomCount: samples.filter((sample) => sample.marks.some((mark) => mark.name === 'feedbackDom')).length,
      metrics: Object.fromEntries(Object.keys(metrics({ marks: [] })).map((key) => [key, {
        cold: cold.map((sample) => sample[key]), coldMedian: quantile(cold.map((sample) => sample[key]), 0.5), coldP95: quantile(cold.map((sample) => sample[key]), 0.95),
        warmMedian: quantile(warm.map((sample) => sample[key]), 0.5), warmP95: quantile(warm.map((sample) => sample[key]), 0.95),
        warmCount: warm.filter((sample) => Number.isFinite(sample[key])).length,
        perProcessWarmMedians: runs.map((run) => quantile(run.samples.filter((sample) => sample.kind === 'warm').map((sample) => metrics(sample)[key]), 0.5))
      }]))
    }
  }
  return {
    units: 'milliseconds unless Percent suffix', manifest,
    allProcessesObserved: manifest.cases.every((config) => new Set(results.filter((result) => result.config.name === config.name).map((result) => result.config.run)).size === manifest.repetitions),
    hardware: results.find((result) => result.hardware)?.hardware,
    failures, complete: failures.length === 0 && Object.values(groups).every((group) => group.complete), groups
  }
}
module.exports = { metrics, quantile, summarize }
