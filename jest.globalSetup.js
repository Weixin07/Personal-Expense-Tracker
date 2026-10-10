// Pin the zone so logic reading the local calendar is deterministic across
// machines. A UTC-ahead zone is deliberate: local and UTC disagree on the
// calendar day during local early morning, which is where date-window faults
// hide. It has no DST, so day arithmetic does not vary by season.
module.exports = () => {
  process.env.TZ = 'Asia/Kuala_Lumpur';
};
