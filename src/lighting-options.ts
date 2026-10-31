import type { Lighting } from './drado-api';
export const lightingOptions: { id: Lighting; label: string; description: string }[] = [
  { id: 'auto', label: 'Auto · Sesuai adegan', description: 'Lighting mengikuti adegan dan arahan dalam percakapan.' },
  { id: 'drama', label: 'Drama · Natural Cinematic Photorealistic', description: 'Cahaya natural berarah, volume wajah lembut, dan tekstur kulit nyata.' },
  { id: 'outdoor', label: 'Outdoor · Cinematic Photorealistic', description: 'Cahaya luar ruang mengikuti waktu, cuaca, dan pantulan lingkungan.' },
  { id: 'horror', label: 'Horror · Cinematic Photorealistic', description: 'Cahaya terarah, fill terbatas, dan bayangan dalam dengan sumber yang masuk akal.' },
  { id: 'fantasy', label: 'Fantasy · Cinematic Illustration', description: 'Karakter, kostum, dunia, dan cahaya bergaya ilustrasi fantasy sinematik yang konsisten.' },
  { id: 'anime', label: 'Anime · 2D Cinematic', description: 'Karakter anime 2D, line art bersih, cel shading, dan animasi yang konsisten.' },
];
