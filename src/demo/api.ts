export type User = { id: string; name: string; username: string; role: string };
export type Hub = { id: string; name: string; capacity: number; used: number; empty: number; available: number; nearFull: boolean; blocked: boolean };
export type Vehicle = { id: string; name: string; battery: number; status: string; eligible: boolean; lowBattery: boolean };
export type Reservation = { id: string; vehicle_id: string; vehicle_name: string; battery: number; source_name: string; destination_name: string | null; destination_spot_id: string | null; status: 'DA_XAC_NHAN' | 'DA_HUY' | 'HET_HAN'; created_at: string; expires_at: string };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-PikePike-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch { throw new ApiError(0, 'OFFLINE', 'Không kết nối được máy chủ. Vui lòng kiểm tra kết nối và thử lại.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.code ?? 'SERVER_ERROR', data?.message ?? 'Máy chủ chưa sẵn sàng. Vui lòng thử lại.');
  return data as T;
}
