const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function normalizedImageType(file: File): string {
  const declaredType = file.type.toLowerCase() === 'image/jpg'
    ? 'image/jpeg'
    : file.type.toLowerCase();

  if (declaredType) return declaredType;

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  return '';
}

export async function readImageAsDataUrl(file: File): Promise<string> {
  const mediaType = normalizedImageType(file);
  if (!SUPPORTED_IMAGE_TYPES.has(mediaType)) {
    throw new Error('JPG, PNG, WEBP 또는 GIF 이미지만 사용할 수 있습니다.');
  }

  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('이미지 파일을 읽을 수 없습니다.'));
      }
    };
    reader.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    reader.onabort = () => reject(new Error('이미지 읽기가 취소되었습니다.'));
    reader.readAsDataURL(file);
  });

  const commaIndex = result.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('이미지 데이터 형식이 올바르지 않습니다.');
  }

  return `data:${mediaType};base64,${result.slice(commaIndex + 1)}`;
}
