import { ArrowDown2 } from 'iconsax-reactjs';
import { useMedia } from './media';
import type { Lighting } from './drado-api';
import { lightingOptions } from './lighting-options';


export function LightingPicker({ value, disabled, saving, onChange }: { value: Lighting; disabled: boolean; saving: boolean; onChange: (value: Lighting) => void }) {
  const { jobs } = useMedia();
  return <label className="lighting-picker" title={lightingOptions.find(option => option.id === value)?.description}>
    <span className="sr-only">Lighting dan gaya visual untuk karakter, image, dan video</span>
    <select aria-label="Lighting dan gaya visual untuk karakter, image, dan video" value={value} disabled={disabled || saving || jobs.some(job => job.status === 'running')} onChange={event => onChange(event.target.value as Lighting)}>
      {lightingOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select><ArrowDown2 size={12} aria-hidden="true" />
    {saving && <span className="sr-only" role="status">Menyimpan lighting…</span>}
  </label>;
}
