'use strict';
const path = require('node:path');
function selectedSources(diagnostics, copies) {
  const failed = diagnostics.records.filter(row => !row.pass && row.container?.codecs.includes('hvc1'));
  if (failed.length !== 31) throw Error('EXPECTED_31_HEVC_OBJECTS');
  const seen = new Set();
  return failed.map(row => {
    const id = `${row.bucket}/${row.key}`;
    if (seen.has(id)) throw Error('DUPLICATE_SOURCE_ID'); seen.add(id);
    const matches = copies.filter(copy => copy.bucket === row.bucket && copy.key === row.key);
    if (matches.length !== 1 || matches[0].status !== 'verified') throw Error('UNVERIFIED_SOURCE');
    return matches[0];
  });
}
function contained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return !!relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
function number(value) { const [a,b] = String(value || '').split('/').map(Number); return b ? a/b : a || 0; }
function details(probe) {
  const video = probe.streams.find(s => s.codec_type === 'video');
  if (!video) throw Error('VIDEO_STREAM_MISSING');
  const audio = probe.streams.find(s => s.codec_type === 'audio');
  const rotation = video.side_data_list?.find(s => s.rotation != null)?.rotation || 0;
  const swap = Math.abs(rotation) % 180 === 90;
  const sar = number(video.sample_aspect_ratio?.replace(':','/')) || 1;
  return { codec: video.codec_name, width: swap ? video.height : video.width, height: swap ? video.width : video.height, rotation, fps: number(video.avg_frame_rate), frames: Number(video.nb_frames) || null, duration: Number(video.duration || probe.format.duration), displayRatio: swap ? video.height / (video.width * sar) : video.width * sar / video.height, audio: audio ? { codec: audio.codec_name, channels: audio.channels, sampleRate: Number(audio.sample_rate) } : null, hdr: ['smpte2084','arib-std-b67'].includes(video.color_transfer), pixelFormat: video.pix_fmt };
}
function validate(source, target) {
  const errors = [];
  if (source.codec !== 'hevc' || target.codec !== 'h264') errors.push('CODEC_MISMATCH');
  if (target.width !== source.width || target.height !== source.height) errors.push('DIMENSION_MISMATCH');
  if (Math.abs(target.duration - source.duration) > Math.max(0.12, 2 / (source.fps || 25))) errors.push('DURATION_MISMATCH');
  if (source.frames && target.frames && source.frames !== target.frames) errors.push('FRAME_COUNT_MISMATCH');
  if (source.fps && Math.abs(target.fps / source.fps - 1) > 0.01) errors.push('FRAME_RATE_MISMATCH');
  if (Math.abs(target.displayRatio / source.displayRatio - 1) > 0.002) errors.push('ASPECT_RATIO_MISMATCH');
  if (target.pixelFormat !== 'yuv420p') errors.push('PIXEL_FORMAT_MISMATCH');
  if (source.audio && (!target.audio || target.audio.codec !== 'aac' || target.audio.channels !== source.audio.channels)) errors.push('AUDIO_MISMATCH');
  if (!source.audio && target.audio) errors.push('UNEXPECTED_AUDIO');
  return errors;
}
module.exports = { selectedSources, contained, details, validate };
