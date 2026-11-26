export function isHandRaised(metadata) {
  try {
    const parsedMetadata = JSON.parse(metadata || '{}');
    return parsedMetadata.studymeet?.handRaised === true;
  } catch {
    return false;
  }
}

export function metadataWithHandRaised(metadata, handRaised) {
  const parsedMetadata = JSON.parse(metadata || '{}');

  if (
    !parsedMetadata ||
    typeof parsedMetadata !== 'object' ||
    Array.isArray(parsedMetadata)
  ) {
    throw new Error('Participant metadata must be a JSON object');
  }

  const studymeetMetadata = parsedMetadata.studymeet;
  if (
    studymeetMetadata !== undefined &&
    (!studymeetMetadata ||
      typeof studymeetMetadata !== 'object' ||
      Array.isArray(studymeetMetadata))
  ) {
    throw new Error('StudyMeet participant metadata must be a JSON object');
  }

  return JSON.stringify({
    ...parsedMetadata,
    studymeet: {
      ...studymeetMetadata,
      handRaised,
    },
  });
}
