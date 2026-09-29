export type MeasurementKey = 'height' | 'shoulder' | 'chest' | 'waist' | 'hip' | 'hip_width' | 'arm_length' | 'torso_length' | 'outer_leg' | 'thigh'
export type Measurement = { cm: number; source: 'estimated' | 'manual' }
export type Measurements = Partial<Record<MeasurementKey, Measurement>>
export type Landmark = { x: number; y: number; z?: number; visibility: number }
export type Landmarks = Record<string, Landmark>
export type Product = {
  id: string; name: string; subtitle: string; type: 'top' | 'bottom'; audience: 'men' | 'women' | 'unisex'; fit: string;
  tags: string[]; color: string; accent: string; price: string; asset: string;
  size_chart: Record<string, Record<string, [number, number]>>
}
export type Recommendation = { product_id: string; size: string | null; fit_status: 'fits' | 'closest' | 'unavailable'; score: number; reasons: string[] }
