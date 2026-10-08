import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, Database, RefreshCw, Save, AlertCircle } from 'lucide-react';

export interface ServerSaveResponse {
  ok: boolean;
  savedAtFormatted: string;
  revision?: number;
  questionsRevision?: number;
  error?: string;
}

interface ServerSaveContextValue {
  dirtySections: Record<string, string>;
  savingSections: Record<string, boolean>;
  savedTimestamps: Record<string, string>;
  lastGlobalSavedAt: string | null;
  isGlobalSaving: boolean;
  markSectionDirty: (
    sectionKey: string,
    description?: string,
    requiresConfirmation?: boolean
  ) => void;
  saveSectionToServer: (
    sectionKey: string,
    description?: string
  ) => Promise<ServerSaveResponse>;
  saveAllToServer: (description?: string) => Promise<ServerSaveResponse>;
  handleExecuteServerSave: (
    sectionKey?: string,
    description?: string
  ) => Promise<ServerSaveResponse>;
}

const ServerSaveContext = createContext<ServerSaveContextValue | null>(null);

export function useServerSave(): ServerSaveContextValue {
  const ctx = useContext(ServerSaveContext);
  if (!ctx) {
    return {
      dirtySections: {},
      savingSections: {},
      savedTimestamps: {},
      lastGlobalSavedAt: null,
      isGlobalSaving: false,
      markSectionDirty: () => {},
      saveSectionToServer: async (): Promise<ServerSaveResponse> => ({
        ok: true,
        savedAtFormatted: new Date().toLocaleTimeString('es-CO')
      }),
      saveAllToServer: async (): Promise<ServerSaveResponse> => ({
        ok: true,
        savedAtFormatted: new Date().toLocaleTimeString('es-CO')
      }),
      handleExecuteServerSave: async (): Promise<ServerSaveResponse> => ({
        ok: true,
        savedAtFormatted: new Date().toLocaleTimeString('es-CO')
      })
    };
  }
  return ctx;
}

interface ServerSaveProviderProps {
  children: React.ReactNode;
  onExecuteServerSave: (
    sectionKey: string,
    description: string
  ) => Promise<ServerSaveResponse>;
}

export function ServerSaveProvider({
  children,
  onExecuteServerSave
}: ServerSaveProviderProps) {
  const [dirtySections, setDirtySections] = useState<Record<string, string>>({});
  const [savingSections, setSavingSections] = useState<Record<string, boolean>>({});
  const [savedTimestamps, setSavedTimestamps] = useState<Record<string, string>>({});
  const [lastGlobalSavedAt, setLastGlobalSavedAt] = useState<string | null>(null);
  const [isGlobalSaving, setIsGlobalSaving] = useState(false);
  const [autoSaveBannerInfo, setAutoSaveBannerInfo] = useState<{
    status: 'saving' | 'saved';
    description: string;
    timeStr?: string;
  } | null>(null);

  const autoSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const bannerHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveSectionToServer = useCallback(
    async (sectionKey: string, description = 'Guardado automático en Base de Datos del Servidor') => {
      setSavingSections((prev) => ({ ...prev, [sectionKey]: true }));
      setIsGlobalSaving(true);
      setAutoSaveBannerInfo({
        status: 'saving',
        description
      });
      if (bannerHideTimerRef.current) {
        clearTimeout(bannerHideTimerRef.current);
      }
      try {
        const res = await onExecuteServerSave(sectionKey, description);
        if (res.ok) {
          const timeStr = res.savedAtFormatted || new Date().toLocaleTimeString('es-CO');
          setSavedTimestamps((prev) => ({
            ...prev,
            [sectionKey]: timeStr
          }));
          setLastGlobalSavedAt(timeStr);
          setDirtySections((prev) => {
            if (!prev[sectionKey]) return prev;
            const next = { ...prev };
            delete next[sectionKey];
            return next;
          });
          setAutoSaveBannerInfo({
            status: 'saved',
            description,
            timeStr
          });
          bannerHideTimerRef.current = setTimeout(() => {
            setAutoSaveBannerInfo(null);
          }, 3200);
        }
        return res;
      } finally {
        setSavingSections((prev) => ({ ...prev, [sectionKey]: false }));
        setIsGlobalSaving(false);
      }
    },
    [onExecuteServerSave]
  );

  const markSectionDirty = useCallback(
    (
      sectionKey: string,
      description = 'Actualización automática en Base de Datos del Servidor',
      requiresConfirmation = false
    ) => {
      if (!requiresConfirmation) {
        if (autoSaveTimersRef.current[sectionKey]) {
          clearTimeout(autoSaveTimersRef.current[sectionKey]);
        }
        autoSaveTimersRef.current[sectionKey] = setTimeout(() => {
          void saveSectionToServer(sectionKey, description);
        }, 350);
        return;
      }
      setDirtySections((prev) => ({
        ...prev,
        [sectionKey]: description
      }));
    },
    [saveSectionToServer]
  );

  const saveAllToServer = useCallback(
    async (description = 'Guardado general en Base de Datos del Servidor') => {
      setIsGlobalSaving(true);
      try {
        const res = await onExecuteServerSave('global_save', description);
        if (res.ok) {
          const timeStr = res.savedAtFormatted || new Date().toLocaleTimeString('es-CO');
          setLastGlobalSavedAt(timeStr);
          setSavedTimestamps((prev) => {
            const next: Record<string, string> = { ...prev, global_save: timeStr };
            Object.keys(dirtySections).forEach((k) => {
              next[k] = timeStr;
            });
            return next;
          });
          setDirtySections({});
        }
        return res;
      } finally {
        setIsGlobalSaving(false);
      }
    },
    [onExecuteServerSave, dirtySections]
  );

  const handleExecuteServerSave = useCallback(
    async (sectionKey = 'global_save', description = 'Guardado en Base de Datos del Servidor') => {
      if (sectionKey === 'global_save') {
        return saveAllToServer(description);
      }
      return saveSectionToServer(sectionKey, description);
    },
    [saveAllToServer, saveSectionToServer]
  );

  const pendingEntries = Object.entries(dirtySections);

  return (
    <ServerSaveContext.Provider
      value={{
        dirtySections,
        savingSections,
        savedTimestamps,
        lastGlobalSavedAt,
        isGlobalSaving,
        markSectionDirty,
        saveSectionToServer,
        saveAllToServer,
        handleExecuteServerSave
      }}
    >
      {children}

      {/* Indicador Flotante de Actualización Automática cuando se detectan cambios */}
      {pendingEntries.length === 0 && autoSaveBannerInfo && (
        <div className="no-print fixed bottom-4 right-4 z-50 max-w-md bg-slate-900/95 backdrop-blur-md text-white border border-emerald-400/70 rounded-2xl px-4 py-2.5 shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0">
            {autoSaveBannerInfo.status === 'saving' ? (
              <RefreshCw className="w-3.5 h-3.5 text-amber-300 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </div>
          <div className="text-xs">
            <div className="font-extrabold text-emerald-300 uppercase tracking-wide flex items-center gap-1.5">
              <span>
                {autoSaveBannerInfo.status === 'saving'
                  ? 'Cambios detectados · Actualizando automáticamente...'
                  : `✓ Base de Datos del Servidor actualizada (${autoSaveBannerInfo.timeStr})`}
              </span>
            </div>
            <div className="text-[11px] text-slate-300 line-clamp-1">
              {autoSaveBannerInfo.description}
            </div>
          </div>
        </div>
      )}

      {/* Barra Flotante Global únicamente cuando algún cambio específico requiera confirmación expresa */}
      {pendingEntries.length > 0 && (
        <div className="no-print fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-3xl bg-slate-900/95 backdrop-blur-md text-white border-2 border-amber-400 rounded-2xl px-4 py-3 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <div className="text-xs font-extrabold text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                <span>Confirmación requerida ({pendingEntries.length})</span>
                <span className="text-[10px] bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full font-mono font-bold">
                  Base de Datos del Servidor
                </span>
              </div>
              <div className="text-xs text-slate-200 line-clamp-1">
                {pendingEntries[pendingEntries.length - 1][1]} — Confirma para aplicar en el servidor.
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={isGlobalSaving}
            onClick={() =>
              saveAllToServer(pendingEntries[pendingEntries.length - 1][1])
            }
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-600 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer shrink-0"
          >
            {isGlobalSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Guardando en Base de Datos del Servidor...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>✓ Confirmar y Guardar en Servidor</span>
              </>
            )}
          </button>
        </div>
      )}
    </ServerSaveContext.Provider>
  );
}

interface OptionServerSaveBarProps {
  sectionKey: string;
  label: string;
  watchValue?: unknown;
  compact?: boolean;
  dark?: boolean;
  alwaysShow?: boolean;
  autoSave?: boolean;
  onBeforeSave?: () => void;
}

export function OptionServerSaveBar({
  sectionKey,
  label,
  watchValue,
  compact = false,
  dark = false,
  alwaysShow = true,
  autoSave,
  onBeforeSave
}: OptionServerSaveBarProps) {
  const {
    dirtySections,
    savingSections,
    savedTimestamps,
    markSectionDirty,
    saveSectionToServer
  } = useServerSave();
  const [localError, setLocalError] = useState<string | null>(null);
  const [justSavedFlash, setJustSavedFlash] = useState(false);

  const isAutoSave = autoSave ?? true;

  const serializedWatch =
    watchValue !== undefined
      ? (() => {
          try {
            return JSON.stringify(watchValue);
          } catch {
            return String(watchValue);
          }
        })()
      : undefined;

  const prevWatchRef = useRef<string | undefined>(serializedWatch);

  useEffect(() => {
    if (serializedWatch === undefined) return;
    if (prevWatchRef.current !== undefined && prevWatchRef.current !== serializedWatch) {
      if (isAutoSave) {
        onBeforeSave?.();
        void saveSectionToServer(
          sectionKey,
          `Actualización automática en «${label}»`
        ).then((res) => {
          if (res.ok) {
            setJustSavedFlash(true);
            setTimeout(() => setJustSavedFlash(false), 4500);
          }
        });
      } else {
        markSectionDirty(sectionKey, `Cambio realizado en «${label}»`);
      }
    }
    prevWatchRef.current = serializedWatch;
  }, [serializedWatch, sectionKey, label, isAutoSave, markSectionDirty, saveSectionToServer, onBeforeSave]);

  const isDirty = Boolean(dirtySections[sectionKey]);
  const isSaving = Boolean(savingSections[sectionKey]);
  const savedTime = savedTimestamps[sectionKey];

  if (!alwaysShow && !isDirty && !isSaving && !justSavedFlash) {
    return null;
  }

  const handleSaveClick = async () => {
    setLocalError(null);
    onBeforeSave?.();
    const res = await saveSectionToServer(
      sectionKey,
      dirtySections[sectionKey] || `Guardado de ${label} en Base de Datos del Servidor`
    );
    if (!res.ok) {
      setLocalError(res.error || 'Error de red al guardar en el servidor');
    } else {
      setJustSavedFlash(true);
      setTimeout(() => setJustSavedFlash(false), 6000);
    }
  };

  if (isAutoSave) {
    if (compact) {
      return (
        <div
          className={`no-print mt-2 pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] transition-all ${
            dark ? 'border-slate-700/80' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {isSaving ? (
              <span
                className={`font-mono flex items-center gap-1.5 font-semibold ${
                  dark ? 'text-amber-300' : 'text-amber-700'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
                <span>Cambios detectados · Actualizando automáticamente en BD del Servidor...</span>
              </span>
            ) : (
              <span
                className={`font-mono flex items-center gap-1.5 font-semibold ${
                  dark ? 'text-emerald-300' : 'text-emerald-700'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  ✓ Actualización automática en Base de Datos del Servidor ({savedTime || 'En tiempo real'})
                </span>
              </span>
            )}
          </div>
          <span
            className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
              dark
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
            }`}
          >
            ⚡ Sincronización Automática
          </span>
        </div>
      );
    }

    return (
      <div
        className={`no-print rounded-xl p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all ${
          isSaving
            ? dark
              ? 'bg-amber-500/20 border-amber-400 text-white'
              : 'bg-amber-50 border-amber-400 text-slate-900 shadow-xs'
            : justSavedFlash
            ? dark
              ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
              : 'bg-emerald-50 border-emerald-300 text-emerald-950'
            : dark
            ? 'bg-slate-900/70 border-slate-700 text-slate-200'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-2 text-xs">
          {isSaving ? (
            <RefreshCw
              className={`w-4 h-4 shrink-0 animate-spin ${
                dark ? 'text-amber-300' : 'text-amber-600'
              }`}
            />
          ) : (
            <Database
              className={`w-4 h-4 shrink-0 ${
                justSavedFlash
                  ? 'text-emerald-600'
                  : dark
                  ? 'text-emerald-400'
                  : 'text-emerald-600'
              }`}
            />
          )}
          <div>
            <span className="font-bold">{label}: </span>
            {isSaving ? (
              <span className={dark ? 'text-amber-200 font-semibold' : 'text-amber-900 font-semibold'}>
                Cambios detectados — Actualizando automáticamente en la Base de Datos del Servidor...
              </span>
            ) : savedTime ? (
              <span className={dark ? 'text-emerald-300 font-mono' : 'text-emerald-800 font-mono'}>
                ✓ Cambios detectados actualizados automáticamente en la Base de Datos del Servidor ({savedTime})
              </span>
            ) : (
              <span className={dark ? 'text-slate-300' : 'text-slate-600'}>
                ✓ Sincronización automática activa con la Base de Datos del Servidor Central (Tiempo real).
              </span>
            )}
            {localError && (
              <div className="text-[11px] text-red-600 font-semibold mt-0.5">{localError}</div>
            )}
          </div>
        </div>

        <div
          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 shrink-0 ${
            isSaving
              ? 'bg-amber-500 text-slate-950'
              : dark
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
          }`}
        >
          {isSaving ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Actualizando BD del Servidor...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>⚡ Guardado Automático en Servidor</span>
            </>
          )}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className={`no-print mt-2 pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] transition-all ${
          dark
            ? isDirty
              ? 'border-amber-400/50 bg-amber-500/15 px-2.5 py-1.5 rounded-lg'
              : 'border-slate-700/80'
            : isDirty
            ? 'border-amber-300 bg-amber-50 px-2.5 py-1.5 rounded-lg'
            : 'border-slate-200/80'
        }`}
      >
        <div className="flex items-center gap-1.5">
          {isDirty ? (
            <span
              className={`font-bold flex items-center gap-1 ${
                dark ? 'text-amber-300' : 'text-amber-900'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span>Cambio realizado en {label}</span>
            </span>
          ) : savedTime || justSavedFlash ? (
            <span
              className={`font-mono flex items-center gap-1 font-semibold ${
                dark ? 'text-emerald-300' : 'text-emerald-700'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>✓ Guardado en BD Servidor ({savedTime || 'Ahora'})</span>
            </span>
          ) : (
            <span className={`${dark ? 'text-slate-400' : 'text-slate-500'} font-mono`}>
              Sincronizado con BD del Servidor
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={isSaving}
          onClick={handleSaveClick}
          className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
            isDirty
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs ring-2 ring-emerald-400/50 animate-pulse'
              : dark
              ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-600'
              : 'bg-slate-900 hover:bg-slate-800 text-white'
          }`}
        >
          {isSaving ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Guardando...</span>
            </>
          ) : (
            <>
              <Save className="w-3 h-3" />
              <span>{isDirty ? '💾 Guardar Cambios en Servidor' : '💾 Guardar Cambios'}</span>
            </>
          )}
        </button>

        {localError && (
          <div className="w-full text-[10px] text-red-600 font-semibold">{localError}</div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`no-print rounded-xl p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all ${
        isDirty
          ? dark
            ? 'bg-amber-500/20 border-amber-400 text-white'
            : 'bg-amber-50 border-amber-400 text-slate-900 shadow-xs'
          : justSavedFlash
          ? dark
            ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
            : 'bg-emerald-50 border-emerald-300 text-emerald-950'
          : dark
          ? 'bg-slate-900/70 border-slate-700 text-slate-200'
          : 'bg-slate-50 border-slate-200 text-slate-700'
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <Database
          className={`w-4 h-4 shrink-0 ${
            isDirty
              ? 'text-amber-600'
              : justSavedFlash
              ? 'text-emerald-600'
              : dark
              ? 'text-sky-400'
              : 'text-slate-600'
          }`}
        />
        <div>
          <span className="font-bold">{label}: </span>
          {isDirty ? (
            <span className={dark ? 'text-amber-200 font-semibold' : 'text-amber-900 font-semibold'}>
              {dirtySections[sectionKey]} — Haz clic en «Guardar Cambios» para persistir en la Base de Datos del Servidor.
            </span>
          ) : savedTime ? (
            <span className={dark ? 'text-emerald-300 font-mono' : 'text-emerald-800 font-mono'}>
              ✓ Guardado directamente en la Base de Datos del Servidor ({savedTime})
            </span>
          ) : (
            <span className={dark ? 'text-slate-300' : 'text-slate-600'}>
              Persistencia directa en la Base de Datos del Servidor Central (Disponible en cualquier equipo).
            </span>
          )}
          {localError && (
            <div className="text-[11px] text-red-600 font-semibold mt-0.5">{localError}</div>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={isSaving}
        onClick={handleSaveClick}
        className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 ${
          isDirty
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-400/50'
            : 'bg-slate-900 hover:bg-slate-800 text-white'
        }`}
      >
        {isSaving ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Guardando en BD del Servidor...</span>
          </>
        ) : (
          <>
            <Save className="w-3.5 h-3.5" />
            <span>
              {isDirty
                ? '💾 Guardar Cambios en Base de Datos del Servidor'
                : '💾 Guardar Cambios en Servidor'}
            </span>
          </>
        )}
      </button>
    </div>
  );
}
