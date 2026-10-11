import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  Server,
  ShieldAlert,
  Trash2,
  Wifi
} from 'lucide-react';
import {
  CURRENT_DATA_SCHEMA_VERSION,
  getSystemDiagnosticsSnapshot,
  subscribeSystemDiagnostics,
  validateLocalCacheSchema,
  clearCacheDiagnosticErrors,
  clearApiRequestDiagnostics,
  recordApiRequestDiagnostic,
  stampCurrentSchemaVersion
} from '../utils/systemDiagnostics';
import type { ForceServerResyncResult } from '../App';

interface SystemDiagnosticsPanelProps {
  onForceServerSync?: () => Promise<ForceServerResyncResult | void> | void;
  serverRevision: number;
  lastServerSyncFormatted?: string;
  studentsCount: number;
  questionsCount: number;
  attemptsCount: number;
}

export const SystemDiagnosticsPanel: React.FC<SystemDiagnosticsPanelProps> = ({
  onForceServerSync,
  serverRevision,
  lastServerSyncFormatted,
  studentsCount,
  questionsCount,
  attemptsCount
}) => {
  const [snapshot, setSnapshot] = useState(() => getSystemDiagnosticsSnapshot());
  const [isPingingServer, setIsPingingServer] = useState(false);
  const [isPurgingCache, setIsPurgingCache] = useState(false);
  const [actionBanner, setActionBanner] = useState<{
    type: 'ok' | 'warn';
    message: string;
  } | null>(null);

  useEffect(() => {
    // Ensure we have a fresh schema report when opening the panel
    validateLocalCacheSchema({ recordIssuesToLog: false });
    setSnapshot(getSystemDiagnosticsSnapshot());

    const unsubscribe = subscribeSystemDiagnostics(() => {
      setSnapshot(getSystemDiagnosticsSnapshot());
    });
    return unsubscribe;
  }, []);

  const handleRunSchemaCheckNow = useCallback(() => {
    const report = validateLocalCacheSchema({ recordIssuesToLog: true });
    setSnapshot(getSystemDiagnosticsSnapshot());
    if (report.isValid) {
      setActionBanner({
        type: 'ok',
        message: `✓ Verificación de esquema completada (${report.checkedAtFormatted}): Todas las estructuras de caché local cumplen la versión ${CURRENT_DATA_SCHEMA_VERSION}.`
      });
    } else {
      setActionBanner({
        type: 'warn',
        message: `⚠️ Se detectaron ${report.issues.length} anomalía(s) de esquema en la caché local. Se recomienda limpiar la caché y sincronizar.`
      });
    }
  }, []);

  const handlePingServerLatency = useCallback(async () => {
    setIsPingingServer(true);
    const startMs = performance.now();
    try {
      const res = await fetch(
        `/api/state?clientRevision=${serverRevision}&ping=true&_t=${Date.now()}`,
        {
          method: 'GET',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        }
      );
      const latencyMs = Math.max(1, Math.round(performance.now() - startMs));
      let rev = serverRevision;
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.revision === 'number') {
          rev = data.revision;
        }
      }
      recordApiRequestDiagnostic({
        method: 'GET',
        endpoint: '/api/state (Ping Diagnóstico)',
        status: res.status,
        ok: res.ok,
        latencyMs,
        source: 'express_api',
        revision: rev,
        errorMessage: res.ok ? undefined : `HTTP ${res.status}`
      });
      setActionBanner({
        type: res.ok ? 'ok' : 'warn',
        message: res.ok
          ? `✓ Ping exitoso al servidor central: Latencia medida de ${latencyMs} ms (Revisión #${rev}).`
          : `⚠️ Respuesta HTTP ${res.status} en ${latencyMs} ms.`
      });
    } catch (err: any) {
      const latencyMs = Math.max(1, Math.round(performance.now() - startMs));
      recordApiRequestDiagnostic({
        method: 'GET',
        endpoint: '/api/state (Ping Diagnóstico)',
        status: null,
        ok: false,
        latencyMs,
        source: 'network_error',
        errorMessage: err?.message || 'Error de conexión'
      });
      setActionBanner({
        type: 'warn',
        message: `⚠️ No fue posible alcanzar /api/state (${err?.message || 'Error de red'}).`
      });
    } finally {
      setIsPingingServer(false);
    }
  }, [serverRevision]);

  const handlePurgeAndResync = useCallback(async () => {
    setIsPurgingCache(true);
    try {
      if (onForceServerSync) {
        await onForceServerSync();
      }
      stampCurrentSchemaVersion();
      clearCacheDiagnosticErrors();
      const report = validateLocalCacheSchema({ recordIssuesToLog: false });
      setSnapshot(getSystemDiagnosticsSnapshot());
      setActionBanner({
        type: 'ok',
        message: `✓ Caché local purgada y reconstruida con esquema oficial v${report.expectedVersion}. Datos sincronizados desde el servidor.`
      });
    } finally {
      setIsPurgingCache(false);
    }
  }, [onForceServerSync]);

  const report = snapshot.latestSchemaReport;
  const { metrics, apiRequestLogs, cacheErrorLogs } = snapshot;

  const latencyBadgeColor =
    metrics.lastLatencyMs === null
      ? 'bg-slate-100 text-slate-700 border-slate-300'
      : metrics.lastLatencyMs < 150
      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
      : metrics.lastLatencyMs < 450
      ? 'bg-sky-50 text-sky-800 border-sky-300'
      : 'bg-amber-50 text-amber-900 border-amber-300';

  const recentLatencyBars = apiRequestLogs.slice(0, 16).reverse();

  return (
    <div className="space-y-6">
      {/* Cabecera Principal del Panel de Diagnóstico de Sistema */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-xs font-mono font-bold uppercase">
              <Activity className="w-3.5 h-3.5" />
              <span>Diagnóstico de Sistema · Telemetría de Sincronización y Caché</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Diagnóstico de Esquema de Caché Local, Estado de Peticiones API y Latencia del Servidor
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Supervise la integridad del esquema de datos en el navegador (<code>v{CURRENT_DATA_SCHEMA_VERSION}</code>), inspeccione los últimos errores de carga de caché y audite los tiempos de respuesta del servidor en tiempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRunSchemaCheckNow}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-sky-700" />
              <span>Verificar Esquema Ahora</span>
            </button>

            <button
              type="button"
              disabled={isPingingServer}
              onClick={handlePingServerLatency}
              className="px-3.5 py-2 rounded-xl bg-[#25579e] hover:bg-[#1e4682] disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            >
              <Wifi className={`w-3.5 h-3.5 ${isPingingServer ? 'animate-ping' : ''}`} />
              <span>{isPingingServer ? 'Midiendo Latencia...' : 'Medir Latencia API (Ping)'}</span>
            </button>

            <button
              type="button"
              disabled={isPurgingCache}
              onClick={handlePurgeAndResync}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPurgingCache ? 'animate-spin' : ''}`} />
              <span>
                {isPurgingCache
                  ? 'Limpiando y Sincronizando...'
                  : 'Limpiar Caché y Resincronizar BD'}
              </span>
            </button>
          </div>
        </div>

        {actionBanner && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
              actionBanner.type === 'ok'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}
          >
            <span>{actionBanner.message}</span>
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              className="px-2 py-0.5 rounded hover:bg-black/5 font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* 4 Tarjetas KPI de Diagnóstico */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Versión del Esquema de Datos */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Esquema de Caché Local</span>
              <Database className="w-4 h-4 text-sky-700" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-extrabold font-mono text-slate-900">
                v{CURRENT_DATA_SCHEMA_VERSION}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  report?.isValid !== false
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {report?.isValid !== false ? '✓ Íntegro' : '⚠️ Antiguo'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Uso localStorage: {((report?.totalStorageBytes || 0) / 1024).toFixed(1)} KB · Rev #{serverRevision}
            </div>
          </div>

          {/* KPI 2: Errores de Carga de Caché */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Errores de Carga de Caché</span>
              <AlertTriangle
                className={`w-4 h-4 ${
                  cacheErrorLogs.length === 0 ? 'text-emerald-600' : 'text-amber-600'
                }`}
              />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-extrabold font-mono text-slate-900">
                {cacheErrorLogs.length}
              </span>
              <span className="text-xs font-semibold text-slate-600">
                {cacheErrorLogs.length === 0 ? 'Sin errores registrados' : 'Eventos capturados'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              Última verificación: {report?.checkedAtFormatted || lastServerSyncFormatted || 'Ahora'}
            </div>
          </div>

          {/* KPI 3: Estado de Peticiones API */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Estado Peticiones API</span>
              <Server className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-extrabold font-mono text-slate-900">
                {metrics.successRatePct}%
              </span>
              <span className="text-xs font-semibold text-emerald-700">
                ({metrics.okRequests}/{metrics.totalRequests} exitosas)
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Fallos/Fallback: {metrics.failedRequests} · Sinc: {lastServerSyncFormatted || 'Activa'}
            </div>
          </div>

          {/* KPI 4: Latencia del Servidor */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Latencia del Servidor</span>
              <Clock className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-extrabold font-mono text-slate-900">
                {metrics.lastLatencyMs !== null ? `${metrics.lastLatencyMs} ms` : '— ms'}
              </span>
              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${latencyBadgeColor}`}>
                {metrics.lastLatencyMs === null
                  ? 'Pendiente'
                  : metrics.lastLatencyMs < 150
                  ? 'Óptima'
                  : metrics.lastLatencyMs < 450
                  ? 'Estable'
                  : 'Alta'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono">
              Promedio: {metrics.avgLatencyMs !== null ? `${metrics.avgLatencyMs} ms` : '—'} · Min/Máx:{' '}
              {metrics.minLatencyMs !== null ? `${metrics.minLatencyMs}/${metrics.maxLatencyMs} ms` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* FILA INTERMEDIA: INSPECCIÓN DE CAMPOS CLAVE DEL CACHÉ LOCAL + HISTORIAL DE ERRORES DE CACHÉ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda (7 cols): Verificación de Esquema por Clave de LocalStorage */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                1. Auditoría de Esquema de Datos en Caché Local (Campos Clave)
              </h3>
              <p className="text-xs text-slate-500">
                Verifica que cada colección en <code>localStorage</code> posea los campos requeridos antes del renderizado.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-lg">
              {studentsCount} alum · {questionsCount} preg · {attemptsCount} int
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Colección / Clave</th>
                  <th className="py-2.5 px-3">Tamaño</th>
                  <th className="py-2.5 px-3">Estado Esquema</th>
                  <th className="py-2.5 px-3">Detalle de Campos Clave</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(report?.inspectedKeys || []).map((item) => (
                  <tr key={item.storageKey} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{item.label}</div>
                      <div className="font-mono text-[10px] text-slate-500">{item.storageKey}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      {item.present ? `${(item.sizeBytes / 1024).toFixed(1)} KB` : '0 KB'}
                    </td>
                    <td className="py-2.5 px-3">
                      {item.validSchema ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Válido</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-800 font-bold text-[11px]">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Antiguo / Incompleto</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{item.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Columna Derecha (5 cols): Últimos Errores de Carga de Caché */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  2. Últimos Errores de Carga de Caché
                </h3>
                <p className="text-xs text-slate-500">
                  Registro de esquemas antiguos, campos faltantes o excepciones capturadas.
                </p>
              </div>
              {cacheErrorLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => clearCacheDiagnosticErrors()}
                  className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpiar registro</span>
                </button>
              )}
            </div>

            {cacheErrorLogs.length === 0 ? (
              <div className="p-8 rounded-xl bg-emerald-50/60 border border-emerald-200 text-center space-y-2">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
                <div className="text-xs font-bold text-emerald-950">
                  0 Errores de Carga de Caché Detectados
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  El esquema local (<code>v{CURRENT_DATA_SCHEMA_VERSION}</code>) contiene todos los campos clave requeridos por los módulos del Panel Docente y Portal Estudiante.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {cacheErrorLogs.map((err) => (
                  <div
                    key={err.id}
                    className={`p-3 rounded-xl border text-xs space-y-1 ${
                      err.severity === 'error'
                        ? 'bg-red-50/80 border-red-200 text-red-950'
                        : 'bg-amber-50/80 border-amber-200 text-amber-950'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                      <span className="font-bold">{err.storageKey}</span>
                      <span>{err.timestampFormatted}</span>
                    </div>
                    <div className="font-semibold">{err.reason}</div>
                    {err.missingFields.length > 0 && (
                      <div className="font-mono text-[10px] opacity-85">
                        Campos afectados: {err.missingFields.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Protección preventiva de arranque: ACTIVA</span>
            <span className="font-mono font-semibold text-emerald-700">
              Esquema v{CURRENT_DATA_SCHEMA_VERSION}
            </span>
          </div>
        </div>
      </div>

      {/* FILA INFERIOR: GRÁFICO DE TIEMPOS DE LATENCIA Y BITÁCORA DE PETICIONES API */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              3. Estado de las Peticiones API y Tiempos de Latencia del Servidor (ms)
            </h3>
            <p className="text-xs text-slate-500">
              Monitoreo en vivo de cada sincronización con <code>/api/state</code> y respaldo Cloud Firestore para depurar problemas de red.
            </p>
          </div>
          {apiRequestLogs.length > 0 && (
            <button
              type="button"
              onClick={() => clearApiRequestDiagnostics()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reiniciar Historial API</span>
            </button>
          )}
        </div>

        {/* Visualizador de Barras de Latencia de las últimas peticiones */}
        {recentLatencyBars.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">
                Curva de Latencia del Servidor (Últimas {recentLatencyBars.length} peticiones API)
              </span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> &lt;150ms (Rápido)
                </span>
                <span className="inline-flex items-center gap-1 text-sky-700 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-xs bg-sky-500" /> 150–450ms (Normal)
                </span>
                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" /> &gt;450ms (Lento)
                </span>
              </div>
            </div>

            <div className="h-28 pt-4 flex items-end gap-2 border-b border-slate-200 px-2">
              {recentLatencyBars.map((req) => {
                const maxScale = Math.max(300, metrics.maxLatencyMs || 300);
                const heightPx = Math.max(
                  18,
                  Math.min(88, Math.round((req.latencyMs / maxScale) * 88))
                );
                const barColor = !req.ok
                  ? 'bg-red-500'
                  : req.latencyMs < 150
                  ? 'bg-emerald-500'
                  : req.latencyMs < 450
                  ? 'bg-sky-500'
                  : 'bg-amber-500';
                return (
                  <div
                    key={req.id}
                    className="flex-1 flex flex-col items-center gap-1 min-w-0"
                    title={`${req.method} ${req.endpoint} — ${req.latencyMs} ms (${req.timestampFormatted})`}
                  >
                    <span className="text-[9px] font-mono font-bold text-slate-600">
                      {req.latencyMs}ms
                    </span>
                    <div
                      className={`w-full max-w-[36px] rounded-t ${barColor} transition-all`}
                      style={{ height: `${heightPx}px` }}
                    />
                    <span className="text-[9px] font-mono text-slate-500 truncate max-w-full">
                      {req.method}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabla Detallada de Peticiones API */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-80">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Hora</th>
                <th className="py-2.5 px-3">Método</th>
                <th className="py-2.5 px-3">Endpoint / Operación</th>
                <th className="py-2.5 px-3">Origen</th>
                <th className="py-2.5 px-3">Estado HTTP</th>
                <th className="py-2.5 px-3">Revisión</th>
                <th className="py-2.5 px-3 text-right">Latencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {apiRequestLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    Aún no se han registrado peticiones en esta sesión. Pulse «Medir Latencia API (Ping)» para realizar una prueba inmediata.
                  </td>
                </tr>
              ) : (
                apiRequestLogs.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/80">
                    <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {req.timestampFormatted}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                          req.method === 'GET'
                            ? 'bg-sky-100 text-sky-900'
                            : req.method === 'POST'
                            ? 'bg-indigo-100 text-indigo-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {req.method}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-800 truncate max-w-[260px]">
                      {req.endpoint}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {req.source === 'express_api'
                        ? 'Servidor /api/state'
                        : req.source === 'firestore_fallback'
                        ? 'Cloud Firestore'
                        : 'Red / Offline'}
                    </td>
                    <td className="py-2 px-3">
                      {req.ok ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono font-bold text-[11px]">
                          ● {req.status || 200} OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-800 font-mono font-bold text-[11px]">
                          ▲ {req.status || 'ERR'} {req.errorMessage ? `(${req.errorMessage})` : ''}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-700">
                      {req.revision !== undefined && req.revision > 0 ? `#${req.revision}` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                      {req.latencyMs} ms
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
