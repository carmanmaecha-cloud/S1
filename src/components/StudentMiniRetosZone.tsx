import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  StudentRecord,
  Question,
  SystemConfig,
  CustomMiniRetoTemplate,
  GeneratedMiniRetoInstance,
  MiniRetoAttemptRecord,
  StudentRetoModuleProgress,
  MiniRetoMechanicId,
  AntiCheatLogEntry,
  AntiCheatDetectionType
} from '../types';
import { getEffectiveMaxLlamadosAtencion } from '../utils/academicServerSummary';
import {
  OFFICIAL_BADGES,
  SPECIAL_DISTINCTION_BADGE,
  MINI_RETO_MECHANICS,
  generateLocalDynamicReto,
  evaluateRetoLocally,
  isMiniRetosWithinSchedule,
  getDefaultRetoProgress,
  normalizeSpanishText
} from '../utils/miniRetosEngine';
import { INITIAL_QUESTIONS } from '../data/questions';
import { OptionServerSaveBar, useServerSave } from './ServerSaveContext';
import {
  Trophy,
  Sparkles,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Send,
  RefreshCw,
  Lightbulb,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Maximize2,
  EyeOff,
  Activity
} from 'lucide-react';

interface StudentMiniRetosZoneProps {
  student: StudentRecord;
  onUpdateStudentProfile: (updated: StudentRecord) => void;
  onRecordRetoAttempt?: (
    studentId: string,
    retoAttempt: MiniRetoAttemptRecord,
    updatedStudent?: StudentRecord
  ) => void;
  onRecordAntiCheatEvent?: (
    studentId: string,
    logEntry: AntiCheatLogEntry,
    updatedStudent?: StudentRecord
  ) => void;
  questions: Question[];
  config: SystemConfig;
  customMiniRetos: CustomMiniRetoTemplate[];
}

const RETO_DURATION_SECONDS = 8 * 60; // 8 minutos máximos por intento de Mini Reto

/**
 * Analiza si el texto y la cadencia biométrica corresponden a una reescritura de texto copiado
 * (transcripción lineal de un chatbot/guía desde otro dispositivo o inyección rápida).
 */
function analyzeCopiedTextRewriting(
  text: string,
  keystrokeIntervalsMs: number[],
  backspaceCount: number,
  totalKeyPresses: number,
  elapsedTypingSeconds: number,
  expectedTeacherText: string
): {
  isRewrittenCopy: boolean;
  reason: string;
  wpm: number;
  stdDevMs: number;
} {
  const clean = text.trim();
  const words = clean ? clean.split(/\s+/) : [];
  const wordCount = words.length;
  const minutes = Math.max(0.1, elapsedTypingSeconds / 60);
  const wpm = Math.round(wordCount / minutes);

  // Calcular desviación estándar de intervalos de tecleo (cadencia)
  let stdDevMs = 45;
  if (keystrokeIntervalsMs.length >= 8) {
    const avg =
      keystrokeIntervalsMs.reduce((acc, v) => acc + v, 0) / keystrokeIntervalsMs.length;
    const variance =
      keystrokeIntervalsMs.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) /
      keystrokeIntervalsMs.length;
    stdDevMs = Math.round(Math.sqrt(variance));
  }

  // 1. Inyección sin tecleo real (por ejemplo, autocompletado de portapapeles o extensión DOM)
  if (clean.length >= 35 && totalKeyPresses < clean.length * 0.45) {
    return {
      isRewrittenCopy: true,
      reason:
        'Inyección o pegado encubierto de texto detectado (longitud del texto supera las pulsaciones reales de teclado).',
      wpm,
      stdDevMs
    };
  }

  // 2. Velocidad sobrehumana o auto-typer (> 135 palabras por minuto sostenidas o cadencia robótica < 10ms)
  if (wordCount >= 15 && (wpm > 135 || (keystrokeIntervalsMs.length > 25 && stdDevMs < 10))) {
    return {
      isRewrittenCopy: true,
      reason: `Digitación automatizada o transcripción acelerada detectada (${wpm} PPM · desviación de cadencia ${stdDevMs}ms).`,
      wpm,
      stdDevMs
    };
  }

  // 3. Detección de Reescritura Lineal de Chatbot / Texto Copiado (Sin correcciones + Muletillas sintácticas de IA o copia literal)
  const normStudent = normalizeSpanishText(clean);
  const normExpected = normalizeSpanishText(expectedTeacherText);
  const chatbotMarkers = [
    'como modelo de lenguaje',
    'en conclusion podemos afirmar',
    'cabe destacar que desde la perspectiva',
    'en el ambito del marketing digital contemporaneo',
    'por consiguiente se deduce que',
    'es fundamental comprender que dicho fenomeno',
    'de acuerdo con la teoria establecida por'
  ];
  const matchedChatbotPhrases = chatbotMarkers.filter((m) => normStudent.includes(m));

  // Si transcribe un párrafo largo (>= 32 palabras) sin borrar ni una sola vez (0 Backspaces) con cadencia uniforme de lectura-copia o frases de chatbot
  if (
    (matchedChatbotPhrases.length > 0 && backspaceCount === 0) ||
    (wordCount >= 36 && backspaceCount === 0 && stdDevMs < 24 && wpm > 72) ||
    (normExpected.length > 45 && normStudent === normExpected)
  ) {
    return {
      isRewrittenCopy: true,
      reason:
        'Reescritura lineal de texto copiado detectada (transcripción continua sin edición natural / patrón sintáctico externo).',
      wpm,
      stdDevMs
    };
  }

  return {
    isRewrittenCopy: false,
    reason: 'Escritura orgánica verificada',
    wpm,
    stdDevMs
  };
}

export function StudentMiniRetosZone({
  student,
  onUpdateStudentProfile,
  onRecordRetoAttempt,
  onRecordAntiCheatEvent,
  questions,
  config,
  customMiniRetos
}: StudentMiniRetosZoneProps) {
  const { handleExecuteServerSave } = useServerSave();
  const [selectedModulo, setSelectedModulo] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedMechanicFilter, setSelectedMechanicFilter] = useState<
    MiniRetoMechanicId | 'random'
  >('random');
  const [activeReto, setActiveReto] = useState<GeneratedMiniRetoInstance | null>(null);
  const [isGeneratingReto, setIsGeneratingReto] = useState(false);
  const [studentAnswer, setStudentAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [lastAttemptResult, setLastAttemptResult] = useState<MiniRetoAttemptRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Anti-Cheat State for Active Mini Reto (Configurable Warning Rule on Focus/Multi-Vector Change + Immediate 0.0/5.0 Suspension on Copy/Reincidence)
  const [retoWarningsCount, setRetoWarningsCount] = useState(0);
  const [retoWarningModalText, setRetoWarningModalText] = useState<string | null>(null);
  const [retoTimeLeftSec, setRetoTimeLeftSec] = useState(RETO_DURATION_SECONDS);
  const [isSplitScreen, setIsSplitScreen] = useState(false);

  // Refs to keep latest answer and warning count without resetting Anti-Cheat / Timer effects on keystrokes
  const studentAnswerRef = useRef<string>('');
  const retoWarningsCountRef = useRef<number>(0);
  const retoWarningHistoryRef = useRef<AntiCheatLogEntry[]>([]);
  const pointerOutsideSinceRef = useRef<number | null>(null);
  const maxLlamadosPermitidos = getEffectiveMaxLlamadosAtencion(student, config);
  useEffect(() => {
    studentAnswerRef.current = studentAnswer;
  }, [studentAnswer]);
  useEffect(() => {
    retoWarningsCountRef.current = retoWarningsCount;
  }, [retoWarningsCount]);

  // Effective Anti-Cheat Config Flags for Mini Retos (all default to true if undefined)
  const isRetoAntiCheatMasterEnabled = config.antiTrampaMiniRetosActivo !== false;
  const isRetoFocusGuardEnabled =
    isRetoAntiCheatMasterEnabled && config.retoBloquearCambioPestanaFoco !== false;
  const isRetoCopyPasteGuardEnabled =
    isRetoAntiCheatMasterEnabled && config.retoSuspenderCopiaPegadoInyeccion !== false;
  const isRetoBiometricGuardEnabled =
    isRetoAntiCheatMasterEnabled && config.retoBiometriaTecleoAntiCopia !== false;
  const isRetoFullscreenGuardEnabled =
    isRetoAntiCheatMasterEnabled && config.retoExigirPantallaCompleta !== false;

  // Biometric Keystroke Telemetry Refs (for Detecting Rewriting of Copied Text)
  const retoStartPerfRef = useRef<number>(performance.now());
  const firstKeyPressPerfRef = useRef<number | null>(null);
  const lastKeyPressPerfRef = useRef<number | null>(null);
  const keystrokeIntervalsRef = useRef<number[]>([]);
  const backspaceCountRef = useRef<number>(0);
  const totalKeyPressesRef = useRef<number>(0);
  const [liveKeystrokeStats, setLiveKeystrokeStats] = useState({
    wpm: 0,
    backspaces: 0,
    keystrokes: 0
  });

  // Ensure student has initialized progress for Modules 1..5
  const retoProgressMap = useMemo(() => {
    const defaults = getDefaultRetoProgress();
    const existing =
      student && student.progresoRetos && typeof student.progresoRetos === 'object'
        ? student.progresoRetos
        : ({} as Record<number, StudentRetoModuleProgress>);
    const merged: Record<1 | 2 | 3 | 4 | 5, StudentRetoModuleProgress> = { ...defaults };
    ([1, 2, 3, 4, 5] as const).forEach((m) => {
      const ex = existing[m];
      if (ex && typeof ex === 'object') {
        merged[m] = {
          ...defaults[m],
          ...ex,
          modulo: m,
          intentosUsados: Number(ex.intentosUsados) || 0,
          maxIntentos: Number(ex.maxIntentos) || 3,
          insigniaDesbloqueada: Boolean(ex.insigniaDesbloqueada),
          mejorPorcentaje: Number(ex.mejorPorcentaje) || 0,
          bloqueadoPorFallo: Boolean(ex.bloqueadoPorFallo),
          preguntasRetoUsadas: Array.isArray(ex.preguntasRetoUsadas)
            ? ex.preguntasRetoUsadas
            : [],
          mecanicasUsadas: Array.isArray(ex.mecanicasUsadas)
            ? ex.mecanicasUsadas
            : [],
          historialIntentos: Array.isArray(ex.historialIntentos)
            ? ex.historialIntentos.filter(Boolean).map((att) => ({
                ...att,
                rubricaDesglose: att.rubricaDesglose || {
                  conceptoClavePct: 0,
                  argumentacionTeoricaPct: 0,
                  originalidadFeynmanPct: 0
                }
              }))
            : []
        };
      }
    });
    return merged;
  }, [student]);

  // Count unlocked badges
  const unlockedBadgesCount = useMemo(() => {
    return ([1, 2, 3, 4, 5] as const).filter((m) => retoProgressMap[m].insigniaDesbloqueada).length;
  }, [retoProgressMap]);

  const allFiveUnlocked = unlockedBadgesCount === 5;

  // Modules (1..5) specifically disabled by the teacher for this student
  const blockedModulesForStudent = useMemo(() => {
    const fromStudent = Array.isArray(student.modulosRetosBloqueados)
      ? student.modulosRetosBloqueados
      : [];
    const fromConfig = config.estudiantesModulosMiniRetosBloqueados?.[student.id] || [];
    return Array.from(new Set([...fromStudent, ...fromConfig])).sort() as (1 | 2 | 3 | 4 | 5)[];
  }, [
    student.modulosRetosBloqueados,
    config.estudiantesModulosMiniRetosBloqueados,
    student.id
  ]);

  const enabledModulesForStudent = useMemo(() => {
    return ([1, 2, 3, 4, 5] as const).filter((m) => !blockedModulesForStudent.includes(m));
  }, [blockedModulesForStudent]);

  const isSelectedModuloDisabledByTeacher = blockedModulesForStudent.includes(selectedModulo);

  // Verify access permissions (Global + Per-Student + Schedule + Suspension)
  const accessStatus = useMemo(() => {
    if (student.suspendido) {
      return {
        allowed: false,
        reason: `Tu sesión se encuentra SUSPENDIDA con calificación 0.0 / 5.0 por infracción a las normas anti-trampa (${student.conceptoInfraccion}). Solicita autorización al docente.`
      };
    }
    const globalOpen = config.miniRetosAbiertos !== false;
    const blockedForStudent = (config.estudiantesSinMiniRetos || []).includes(student.id);
    if (!globalOpen || blockedForStudent) {
      return {
        allowed: false,
        reason:
          'La Zona de Mini Retos & Insignias se encuentra temporalmente deshabilitada por el docente para tu sesión.'
      };
    }
    const scheduleCheck = isMiniRetosWithinSchedule(config);
    if (!scheduleCheck.allowed) {
      return {
        allowed: false,
        reason: scheduleCheck.reason
      };
    }
    return { allowed: true, reason: 'Disponible' };
  }, [config, student.id, student.suspendido, student.conceptoInfraccion]);

  const currentModProgress = retoProgressMap[selectedModulo];
  const currentBadgeDef = OFFICIAL_BADGES.find((b) => b.modulo === selectedModulo)!;
  const thresholdPct = Math.max(50, Math.min(95, Number(config.umbralAprobacionMiniRetoPct) || 60));

  // Count words in open answer
  const wordCount = useMemo(() => {
    const trimmed = studentAnswer.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [studentAnswer]);

  // Execute Immediate Automatic Suspension (0.0 / 5.0 — SUSPENDIDO) on Reincidence or Copy/Paste/Rewrite Attempt
  const executeAntiCheatRetoSuspension = useCallback(
    (
      motivoInfraccion: string,
      warningsTriggered: number,
      tipoDeteccion: AntiCheatDetectionType = 'CAMBIO_PESTANA'
    ) => {
      if (!activeReto) return;

      const nowFormatted = new Date().toLocaleString('es-CO');
      const modProg = retoProgressMap[activeReto.modulo];
      const currentAttemptNum = Math.min(3, modProg.intentosUsados + 1) as 1 | 2 | 3;
      const elapsedTypingSec = firstKeyPressPerfRef.current
        ? Math.max(1, (performance.now() - firstKeyPressPerfRef.current) / 1000)
        : 1;
      const currentAnswerText = studentAnswerRef.current;
      const rewriteCheck = analyzeCopiedTextRewriting(
        currentAnswerText,
        keystrokeIntervalsRef.current,
        backspaceCountRef.current,
        totalKeyPressesRef.current,
        elapsedTypingSec,
        activeReto.respuestaEsperadaDocente
      );

      const elapsedRetoSec = Math.max(
        1,
        Math.round((performance.now() - retoStartPerfRef.current) / 1000)
      );

      const finalLogEntry: AntiCheatLogEntry = {
        id: `AC-RETO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        studentId: student.id,
        studentName: student.nombre,
        fecha: nowFormatted,
        origen: 'MINI_RETO',
        modalidadOModulo: `Módulo ${activeReto.modulo} — ${activeReto.mecanicaNombre}`,
        tipoDeteccion,
        descripcion: motivoInfraccion,
        numeroLlamado: warningsTriggered,
        maxLlamadosPermitidos,
        accionTomada: 'SUSPENSION_0_0'
      };
      const updatedRetoLogs = [...retoWarningHistoryRef.current, finalLogEntry];
      retoWarningHistoryRef.current = updatedRetoLogs;

      const suspendedAttempt: MiniRetoAttemptRecord = {
        attemptId: `RETO-SUSP-${student.id}-M${activeReto.modulo}-${Date.now()}`,
        fecha: nowFormatted,
        timestampMs: Date.now(),
        studentId: student.id,
        studentName: student.nombre,
        modulo: activeReto.modulo,
        intentoNumero: currentAttemptNum,
        mecanicaId: activeReto.mecanicaId,
        mecanicaNombre: activeReto.mecanicaNombre,
        familia: activeReto.familia,
        sourceQuestionId: activeReto.sourceQuestionId,
        tituloReto: activeReto.tituloReto,
        narrativaEscenario: activeReto.narrativaEscenario,
        preguntaReto: activeReto.preguntaReto,
        respuestaEsperadaDocente: activeReto.respuestaEsperadaDocente,
        conceptosClave: Array.isArray(activeReto.conceptosClave) ? activeReto.conceptosClave : [],
        respuestaEstudiante:
          currentAnswerText.trim() || `[Intento suspendido automáticamente: ${motivoInfraccion}]`,
        porcentajeIA: 0,
        umbralAprobacionPct: activeReto.umbralAprobacionPct || thresholdPct,
        rubricaDesglose: {
          conceptoClavePct: 0,
          argumentacionTeoricaPct: 0,
          originalidadFeynmanPct: 0
        },
        aprobado: false,
        suspendidoPorTrampa: true,
        notaEquivalenteEscala5: 0.0,
        motivoInfraccion,
        advertenciasRegistradas: warningsTriggered,
        maxLlamadosPermitidosEnIntento: maxLlamadosPermitidos,
        historialLlamadosIntento: updatedRetoLogs,
        telemetriaEscritura: {
          wpm: rewriteCheck.wpm,
          correccionesBackspace: backspaceCountRef.current,
          desviacionCadenciaMs: rewriteCheck.stdDevMs,
          sospechaReescrituraCopia: rewriteCheck.isRewrittenCopy
        },
        tiempoEmpleadoSegundos: elapsedRetoSec,
        retroalimentacionIA: `🚨 SUSPENDIDO AUTOMÁTICAMENTE — Calificación: 0.0 / 5.0 (0%). Motivo de sanción: ${motivoInfraccion}. Este evento ha quedado registrado en la tabla de auditoría del docente.`,
        modoEvaluacion: 'ANTI_TRAMPA_SUSPENDIDO'
      };

      const updatedModProgress: StudentRetoModuleProgress = {
        ...modProg,
        intentosUsados: 3,
        bloqueadoPorFallo: true,
        suspendidoPorTrampa: true,
        motivoSuspensionReto: motivoInfraccion,
        preguntasRetoUsadas: Array.from(
          new Set([...modProg.preguntasRetoUsadas, activeReto.sourceQuestionId])
        ),
        mecanicasUsadas: Array.from(new Set([...modProg.mecanicasUsadas, activeReto.mecanicaId])),
        historialIntentos: [suspendedAttempt, ...modProg.historialIntentos]
      };

      const nextProgresoRetos: Record<1 | 2 | 3 | 4 | 5, StudentRetoModuleProgress> = {
        ...retoProgressMap,
        [activeReto.modulo]: updatedModProgress
      };

      const prevHistorialGlobal = Array.isArray(student.historialIntentosRetos)
        ? student.historialIntentosRetos
        : [];
      const prevAntiCheatLogs = Array.isArray(student.historialLlamadosAtencion)
        ? student.historialLlamadosAtencion
        : [];

      const updatedStudent: StudentRecord = {
        ...student,
        suspendido: true,
        conceptoInfraccion: `Mini Reto M${activeReto.modulo} Suspendido (0.0 / 5.0): ${motivoInfraccion}`,
        advertenciasCambioFoco: Math.max(student.advertenciasCambioFoco || 0, warningsTriggered),
        progresoRetos: nextProgresoRetos,
        historialIntentosRetos: [suspendedAttempt, ...prevHistorialGlobal],
        historialLlamadosAtencion: [finalLogEntry, ...prevAntiCheatLogs]
      };

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      if (onRecordAntiCheatEvent) {
        onRecordAntiCheatEvent(student.id, finalLogEntry, updatedStudent);
      }
      if (onRecordRetoAttempt) {
        onRecordRetoAttempt(student.id, suspendedAttempt, updatedStudent);
      } else {
        onUpdateStudentProfile(updatedStudent);
      }
      void handleExecuteServerSave(
        'estudiante_vitrina_insignias',
        `Actualización automática de Mini Reto M${activeReto.modulo} en Base de Datos del Servidor`
      );
      setLastAttemptResult(suspendedAttempt);
      setRetoWarningModalText(null);
      setActiveReto(null);
      setIsEvaluating(false);
    },
    [
      activeReto,
      retoProgressMap,
      student,
      thresholdPct,
      maxLlamadosPermitidos,
      onUpdateStudentProfile,
      onRecordRetoAttempt,
      onRecordAntiCheatEvent,
      handleExecuteServerSave
    ]
  );

  // Active Anti-Cheat Event Listeners while a Mini Reto is open
  useEffect(() => {
    if (!activeReto || !isRetoAntiCheatMasterEnabled) return;

    let armed = false;
    let lastInfractionTimestamp = 0;
    const armTimer = setTimeout(() => {
      armed = true;
    }, 800);

    // Register Focus / Fullscreen / Tab-Switch / Minimize / App-Switch Warning (Configurable maxLlamadosPermitidos allowed)
    const handleFocusInfraction = (
      motivo: string,
      tipoDeteccion: AntiCheatDetectionType = 'CAMBIO_PESTANA'
    ) => {
      if (!armed) return;
      const now = Date.now();
      if (now - lastInfractionTimestamp < 900) return;
      lastInfractionTimestamp = now;

      const next = retoWarningsCountRef.current + 1;
      retoWarningsCountRef.current = next;
      setRetoWarningsCount(next);

      const nowFormatted = new Date().toLocaleString('es-CO');

      if (next <= maxLlamadosPermitidos) {
        const warningLog: AntiCheatLogEntry = {
          id: `AC-RETO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          studentId: student.id,
          studentName: student.nombre,
          fecha: nowFormatted,
          origen: 'MINI_RETO',
          modalidadOModulo: `Módulo ${activeReto.modulo} — ${activeReto.mecanicaNombre}`,
          tipoDeteccion,
          descripcion: motivo,
          numeroLlamado: next,
          maxLlamadosPermitidos,
          accionTomada: 'LLAMADO_ATENCION'
        };
        const updatedLogs = [...retoWarningHistoryRef.current, warningLog];
        retoWarningHistoryRef.current = updatedLogs;

        const prevAntiCheatLogs = Array.isArray(student.historialLlamadosAtencion)
          ? student.historialLlamadosAtencion
          : [];
        const updatedStudentWarning: StudentRecord = {
          ...student,
          advertenciasCambioFoco: Math.max(student.advertenciasCambioFoco || 0, next),
          historialLlamadosAtencion: [warningLog, ...prevAntiCheatLogs]
        };

        if (onRecordAntiCheatEvent) {
          onRecordAntiCheatEvent(student.id, warningLog, updatedStudentWarning);
        } else {
          onUpdateStudentProfile(updatedStudentWarning);
        }

        const restantes = Math.max(0, maxLlamadosPermitidos - next);
        setRetoWarningModalText(
          `⚠️ LLAMADO DE ATENCIÓN ANTI-TRAMPA (${next} DE ${maxLlamadosPermitidos}): Se detectó "${motivo}". ${
            restantes > 0
              ? `Te quedan ${restantes} llamado(s) de atención antes de la suspensión automática.`
              : 'Este es tu ÚLTIMO llamado permitido; la próxima infracción suspenderá el Mini Reto con calificación 0.0 / 5.0 (SUSPENDIDO).'
          }`
        );
      } else {
        executeAntiCheatRetoSuspension(
          `Superó el límite de llamados de atención (${next}/${maxLlamadosPermitidos} incidencias): ${motivo}`,
          next,
          tipoDeteccion
        );
      }
    };

    const handleVisibilityChange = () => {
      if ((document.hidden || document.visibilityState === 'hidden') && isRetoFocusGuardEnabled) {
        const isMinimized =
          window.outerWidth <= 160 ||
          window.outerHeight <= 160 ||
          window.screenX < -10000 ||
          window.screenY < -10000;
        if (isMinimized) {
          if (config.detectarMinimizarPestana !== false) {
            handleFocusInfraction(
              'Minimizar la pestaña o ventana del navegador durante el Mini Reto',
              'MINIMIZAR_PESTANA_VENTANA'
            );
          }
        } else if (config.detectarCambioPestana !== false) {
          handleFocusInfraction(
            'Cambio de pestaña activa del navegador durante el Mini Reto',
            'CAMBIO_PESTANA'
          );
        }
      }
    };

    const handleWindowBlur = () => {
      if (!isRetoFocusGuardEnabled) return;
      setTimeout(() => {
        if (document.hidden) return;
        const isMinimized =
          window.outerWidth <= 160 ||
          window.outerHeight <= 160 ||
          window.screenX < -10000 ||
          window.screenY < -10000;
        if (isMinimized) {
          if (config.detectarMinimizarPestana !== false) {
            handleFocusInfraction(
              'Minimizar la ventana del navegador durante el Mini Reto',
              'MINIMIZAR_PESTANA_VENTANA'
            );
          }
        } else if (config.detectarCambioAplicacion !== false) {
          handleFocusInfraction(
            'Cambio de aplicación externa (Alt+Tab, asistente IA o segunda pantalla) durante el Mini Reto',
            'CAMBIO_APLICACION_EXTERNA'
          );
        }
      }, 80);
    };

    const handleFullscreenChange = () => {
      if (armed && isRetoFullscreenGuardEnabled && !document.fullscreenElement) {
        handleFocusInfraction(
          'Salida del modo de Pantalla Completa durante el reto',
          'SALIDA_PANTALLA_COMPLETA'
        );
      }
    };

    const handleMouseLeaveDocument = (e: MouseEvent) => {
      if (config.detectarAbandonoPunteroIA === false) return;
      if (
        e.clientY <= 0 ||
        e.clientX <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        pointerOutsideSinceRef.current = Date.now();
      }
    };

    const handleMouseEnterDocument = () => {
      if (config.detectarAbandonoPunteroIA === false) return;
      if (pointerOutsideSinceRef.current) {
        const elapsedOutsideMs = Date.now() - pointerOutsideSinceRef.current;
        pointerOutsideSinceRef.current = null;
        if (elapsedOutsideMs >= 9000 && !document.hidden) {
          handleFocusInfraction(
            `Abandono prolongado del puntero fuera de la ventana (${Math.round(elapsedOutsideMs / 1000)}s en monitor secundario o app externa)`,
            'ABANDONO_PUNTERO_FUERA_VENTANA'
          );
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (!isRetoCopyPasteGuardEnabled) return;
      e.preventDefault();
      handleFocusInfraction(
        'Intento de abrir menú contextual (Clic derecho)',
        'COPIA_PEGADO_CLIC_DERECHO'
      );
    };

    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (!isRetoCopyPasteGuardEnabled) return;
      const key = (e.key || '').toUpperCase();
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      const isCopyShortcut = isCtrlOrMeta && (key === 'C' || key === 'V' || key === 'X');
      const isInspectOrSource =
        key === 'F12' ||
        (isCtrlOrMeta && (key === 'U' || key === 'P' || key === 'S')) ||
        (isCtrlOrMeta && e.shiftKey && (key === 'I' || key === 'J' || key === 'C'));
      const isPrintScreen = key === 'PRINTSCREEN';

      if (isCopyShortcut || isInspectOrSource || isPrintScreen) {
        e.preventDefault();
        e.stopPropagation();
        handleFocusInfraction(
          `Intento prohibido de copia, pegado o inspección mediante atajo (${
            isPrintScreen ? 'PrintScreen' : isCtrlOrMeta ? `Ctrl+${key}` : key
          })`,
          isInspectOrSource || isPrintScreen
            ? 'CAPTURA_IMPRESION_DEVTOOLS'
            : 'COPIA_PEGADO_CLIC_DERECHO'
        );
      }
    };

    const checkWindowSplit = () => {
      if (!isRetoFullscreenGuardEnabled) {
        setIsSplitScreen(false);
        return;
      }
      const availW = window.screen?.availWidth || window.innerWidth;
      const splitNow = availW > 0 && window.innerWidth < availW * 0.85;
      setIsSplitScreen(splitNow);
      if (armed && config.detectarMinimizarPestana !== false && (window.innerWidth <= 200 || window.innerHeight <= 180)) {
        handleFocusInfraction(
          'Minimizar o colapsar el tamaño de la ventana del Mini Reto',
          'MINIMIZAR_PESTANA_VENTANA'
        );
      } else if (armed && config.detectarSplitScreen !== false && availW >= 900 && window.innerWidth < availW * 0.62) {
        handleFocusInfraction(
          'Reducción de ventana o pantalla dividida (Split-Screen) durante el Mini Reto',
          'PANTALLA_DIVIDIDA_SPLIT'
        );
      }
    };

    checkWindowSplit();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('mouseleave', handleMouseLeaveDocument);
    document.addEventListener('mouseenter', handleMouseEnterDocument);
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDownGlobal, true);
    window.addEventListener('resize', checkWindowSplit);

    return () => {
      clearTimeout(armTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('mouseleave', handleMouseLeaveDocument);
      document.removeEventListener('mouseenter', handleMouseEnterDocument);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDownGlobal, true);
      window.removeEventListener('resize', checkWindowSplit);
    };
  }, [
    activeReto?.instanceId,
    isRetoAntiCheatMasterEnabled,
    isRetoFocusGuardEnabled,
    isRetoCopyPasteGuardEnabled,
    isRetoFullscreenGuardEnabled,
    maxLlamadosPermitidos,
    config,
    student,
    onRecordAntiCheatEvent,
    onUpdateStudentProfile,
    executeAntiCheatRetoSuspension
  ]);

  // Monotonic Countdown Timer for Active Mini Reto (8 minutes max)
  useEffect(() => {
    if (!activeReto) return;
    retoStartPerfRef.current = performance.now();
    setRetoTimeLeftSec(RETO_DURATION_SECONDS);

    const timer = setInterval(() => {
      const elapsed = Math.floor((performance.now() - retoStartPerfRef.current) / 1000);
      const remaining = Math.max(0, RETO_DURATION_SECONDS - elapsed);
      setRetoTimeLeftSec(remaining);
      if (remaining === 0) {
        executeAntiCheatRetoSuspension(
          'Tiempo máximo del Mini Reto agotado (8:00 min) sin entrega',
          retoWarningsCountRef.current
        );
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeReto?.instanceId, executeAntiCheatRetoSuspension]);

  // Reset keystroke telemetry when starting a new reto
  const resetKeystrokeTelemetry = () => {
    firstKeyPressPerfRef.current = null;
    lastKeyPressPerfRef.current = null;
    keystrokeIntervalsRef.current = [];
    backspaceCountRef.current = 0;
    totalKeyPressesRef.current = 0;
    retoWarningHistoryRef.current = [];
    retoWarningsCountRef.current = 0;
    setLiveKeystrokeStats({ wpm: 0, backspaces: 0, keystrokes: 0 });
  };

  // Pick a random unseen question from the 740 bank (or custom teacher template) and generate the Mini Reto
  const handleStartOrRenewReto = async (moduloTarget: 1 | 2 | 3 | 4 | 5) => {
    setErrorMessage(null);
    setLastAttemptResult(null);
    setStudentAnswer('');
    setShowHint(false);
    setRetoWarningsCount(0);
    setRetoWarningModalText(null);
    resetKeystrokeTelemetry();

    const modProg = retoProgressMap[moduloTarget];
    if (blockedModulesForStudent.includes(moduloTarget)) {
      setErrorMessage(
        `El Módulo ${moduloTarget} de Mini Retos se encuentra actualmente deshabilitado por el docente para tu sesión.`
      );
      return;
    }
    if (modProg.insigniaDesbloqueada) {
      setErrorMessage(
        '¡Ya conquistaste la insignia de este módulo! No necesitas realizar más intentos en este módulo.'
      );
      return;
    }
    if (modProg.suspendidoPorTrampa) {
      setErrorMessage(
        `Este módulo se encuentra SUSPENDIDO con calificación 0.0 / 5.0 por infracción anti-trampa (${modProg.motivoSuspensionReto}). Solicita desbloqueo al docente.`
      );
      return;
    }
    if (modProg.intentosUsados >= 3 || modProg.bloqueadoPorFallo) {
      setErrorMessage(
        'Has agotado los 3 intentos permitidos para este módulo. Repasa la guía de estudio y solicita una nueva convocatoria al docente.'
      );
      return;
    }

    // Request Fullscreen to enforce secure environment if enabled in config
    if (isRetoFullscreenGuardEnabled) {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // Continue if browser blocks fullscreen in iframe
      }
    }

    setIsGeneratingReto(true);

    try {
      // 1. Check if there is an active Custom Teacher Mini Reto for this module not yet used by the student
      const safeCustomList = Array.isArray(customMiniRetos) ? customMiniRetos.filter(Boolean) : [];
      const activeCustomForMod = safeCustomList.filter(
        (c) =>
          c.activo &&
          Number(c.modulo) === moduloTarget &&
          !modProg.preguntasRetoUsadas.includes(c.id) &&
          (selectedMechanicFilter === 'random' || c.mecanicaId === selectedMechanicFilter)
      );

      if (activeCustomForMod.length > 0) {
        const pickedCustom =
          activeCustomForMod[Math.floor(Math.random() * activeCustomForMod.length)];
        const instance: GeneratedMiniRetoInstance = {
          instanceId: `CUSTOM-${pickedCustom.id}-${Date.now()}`,
          sourceQuestionId: pickedCustom.id,
          modulo: moduloTarget,
          tema: pickedCustom.tema,
          mecanicaId: pickedCustom.mecanicaId,
          mecanicaNombre: pickedCustom.mecanicaNombre,
          familia: pickedCustom.familia,
          tituloReto: pickedCustom.titulo,
          narrativaEscenario: pickedCustom.narrativa,
          preguntaReto: pickedCustom.preguntaReto,
          pistaOpcional: pickedCustom.pistaOpcional,
          respuestaEsperadaDocente: pickedCustom.respuestaEsperada,
          criterioEvaluacion60: pickedCustom.criterioEvaluacion60,
          conceptosClave: pickedCustom.conceptosClave,
          umbralAprobacionPct: pickedCustom.umbralAprobacionPct || thresholdPct,
          generadoPor: 'BANCO_DOCENTE'
        };
        setActiveReto(instance);
        setIsGeneratingReto(false);
        return;
      }

      // 2. Otherwise, pick a random unseen question from the 740 Question Bank for this module
      const safeBank =
        Array.isArray(questions) && questions.length > 0 ? questions : INITIAL_QUESTIONS;
      const modQuestions = safeBank.filter((q) => q && Number(q.modulo) === moduloTarget);
      const effectiveModQuestions =
        modQuestions.length > 0
          ? modQuestions
          : INITIAL_QUESTIONS.filter((q) => Number(q.modulo) === moduloTarget);
      const unseenQuestions = effectiveModQuestions.filter(
        (q) => !modProg.preguntasRetoUsadas.includes(q.id)
      );
      const pool = unseenQuestions.length > 0 ? unseenQuestions : effectiveModQuestions;
      const randomQuestion =
        pool[Math.floor(Math.random() * pool.length)] || INITIAL_QUESTIONS[0];

      // Choose a mechanic not yet used in this module if possible
      const unseenMechanics = MINI_RETO_MECHANICS.filter(
        (m) => !modProg.mecanicasUsadas.includes(m.id)
      );
      const mechanicPool = unseenMechanics.length > 0 ? unseenMechanics : MINI_RETO_MECHANICS;
      const chosenMechanic =
        selectedMechanicFilter !== 'random'
          ? MINI_RETO_MECHANICS.find((m) => m.id === selectedMechanicFilter) || mechanicPool[0]
          : mechanicPool[Math.floor(Math.random() * mechanicPool.length)];

      const localFallbackInstance = generateLocalDynamicReto(
        randomQuestion,
        chosenMechanic.id,
        thresholdPct
      );

      // 3. Try calling backend Gemini API (/api/generar-reto)
      try {
        const response = await fetch('/api/generar-reto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: randomQuestion,
            mecanicaId: chosenMechanic.id,
            mecanicaNombre: chosenMechanic.nombre,
            familia: chosenMechanic.familia,
            instruccionPromptIA: chosenMechanic.instruccionPromptIA
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.reto && data.reto.narrativaEscenario && data.reto.preguntaReto) {
            setActiveReto({
              ...localFallbackInstance,
              tituloReto: data.reto.tituloReto || localFallbackInstance.tituloReto,
              narrativaEscenario: data.reto.narrativaEscenario,
              preguntaReto: data.reto.preguntaReto,
              pistaOpcional: data.reto.pistaOpcional || localFallbackInstance.pistaOpcional,
              respuestaEsperadaDocente:
                data.reto.respuestaEsperadaDocente ||
                localFallbackInstance.respuestaEsperadaDocente,
              criterioEvaluacion60:
                data.reto.criterioEvaluacion60 || localFallbackInstance.criterioEvaluacion60,
              conceptosClave:
                Array.isArray(data.reto.conceptosClave) && data.reto.conceptosClave.length > 0
                  ? data.reto.conceptosClave
                  : localFallbackInstance.conceptosClave,
              generadoPor: 'IA_GEMINI'
            });
            setIsGeneratingReto(false);
            return;
          }
        }
      } catch {
        // Offline fallback
      }

      setActiveReto(localFallbackInstance);
    } finally {
      setIsGeneratingReto(false);
    }
  };

  // Track Biometric Keystrokes on the Answer Textarea
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const now = performance.now();
    if (firstKeyPressPerfRef.current === null) {
      firstKeyPressPerfRef.current = now;
    }
    if (lastKeyPressPerfRef.current !== null) {
      const interval = now - lastKeyPressPerfRef.current;
      if (interval > 5 && interval < 3000) {
        keystrokeIntervalsRef.current.push(interval);
      }
    }
    lastKeyPressPerfRef.current = now;

    if (e.key === 'Backspace' || e.key === 'Delete') {
      backspaceCountRef.current += 1;
    } else if (e.key.length === 1) {
      totalKeyPressesRef.current += 1;
    }

    const elapsedMin = Math.max(0.08, (now - (firstKeyPressPerfRef.current || now)) / 60000);
    const currentWords = studentAnswer.trim() ? studentAnswer.trim().split(/\s+/).length : 0;
    setLiveKeystrokeStats({
      wpm: Math.round(currentWords / elapsedMin),
      backspaces: backspaceCountRef.current,
      keystrokes: totalKeyPressesRef.current
    });
  };

  // Detect Bulk Text Injection / Hidden Paste / Auto-Fill in onChange
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    const deltaChars = nextVal.length - studentAnswer.length;

    // Detect Bulk Text Injection / Hidden Paste / Auto-Fill in onChange
    if (isRetoCopyPasteGuardEnabled && deltaChars > 18) {
      executeAntiCheatRetoSuspension(
        `Inyección instantánea de texto copiado (+${deltaChars} caracteres en un solo pulso)`,
        retoWarningsCountRef.current + 1
      );
      return;
    }
    setStudentAnswer(nextVal);
  };

  // Evaluate Student's Open Response (First checks Biometric Rewriting of Copied Text, then Hybrid AI / Local)
  const handleEvaluateResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReto) return;

    const cleanAnswer = studentAnswer.trim();
    if (cleanAnswer.length < 12 || wordCount < 3) {
      setErrorMessage(
        'Por favor escribe un argumento más completo (explica el concepto y por qué aplica al caso con tus propias palabras).'
      );
      return;
    }

    // 1. Check Biometric Keystroke Dynamics for Rewriting of Copied Text
    const elapsedTypingSec = firstKeyPressPerfRef.current
      ? Math.max(1, (performance.now() - firstKeyPressPerfRef.current) / 1000)
      : 1;
    const rewriteAudit = analyzeCopiedTextRewriting(
      cleanAnswer,
      keystrokeIntervalsRef.current,
      backspaceCountRef.current,
      totalKeyPressesRef.current,
      elapsedTypingSec,
      activeReto.respuestaEsperadaDocente
    );

    if (isRetoBiometricGuardEnabled && rewriteAudit.isRewrittenCopy) {
      executeAntiCheatRetoSuspension(rewriteAudit.reason, retoWarningsCountRef.current + 1);
      return;
    }

    setErrorMessage(null);
    setIsEvaluating(true);

    const modProg = retoProgressMap[activeReto.modulo];
    const currentAttemptNum = (modProg.intentosUsados + 1) as 1 | 2 | 3;
    const effectiveThreshold = activeReto.umbralAprobacionPct || thresholdPct;

    let finalEvaluation: {
      porcentajeIA: number;
      rubricaDesglose: {
        conceptoClavePct: number;
        argumentacionTeoricaPct: number;
        originalidadFeynmanPct: number;
      };
      aprobado: boolean;
      retroalimentacionIA: string;
      pistaSocratica?: string;
      modoEvaluacion: 'IA_GEMINI' | 'LOCAL_FALLBACK';
    } | null = null;

    // 2. Try Gemini Semantic Evaluation via /api/evaluar-reto
    try {
      const response = await fetch('/api/evaluar-reto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modulo: activeReto.modulo,
          tema: activeReto.tema,
          mecanicaNombre: activeReto.mecanicaNombre,
          narrativaEscenario: activeReto.narrativaEscenario,
          preguntaReto: activeReto.preguntaReto,
          respuestaEsperadaDocente: activeReto.respuestaEsperadaDocente,
          criterioEvaluacion60: activeReto.criterioEvaluacion60,
          conceptosClave: activeReto.conceptosClave,
          respuestaEstudiante: cleanAnswer,
          umbralAprobacionPct: effectiveThreshold
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.evaluacion) {
          const ev = data.evaluacion;
          const pct = Math.max(0, Math.min(100, Math.round(Number(ev.porcentajeIA) || 0)));
          const passed = pct >= effectiveThreshold;
          finalEvaluation = {
            porcentajeIA: pct,
            rubricaDesglose: {
              conceptoClavePct: Math.min(40, Math.max(0, Number(ev.conceptoClavePct) || 0)),
              argumentacionTeoricaPct: Math.min(
                40,
                Math.max(0, Number(ev.argumentacionTeoricaPct) || 0)
              ),
              originalidadFeynmanPct: Math.min(
                20,
                Math.max(0, Number(ev.originalidadFeynmanPct) || 0)
              )
            },
            aprobado: passed,
            retroalimentacionIA:
              ev.retroalimentacionIA ||
              (passed
                ? '¡Excelente dominio conceptual y argumentación aplicada!'
                : 'Tu respuesta se acerca, pero aún falta conectar el concepto técnico con el caso.'),
            pistaSocratica: ev.pistaSocratica || '',
            modoEvaluacion: 'IA_GEMINI'
          };
        }
      }
    } catch {
      // Fallback to local semantic evaluator below
    }

    // 3. Offline / Contingency Local Semantic Evaluator Fallback
    if (!finalEvaluation) {
      finalEvaluation = evaluateRetoLocally(activeReto, cleanAnswer);
    }

    const elapsedRetoSec = Math.max(
      1,
      Math.round((performance.now() - retoStartPerfRef.current) / 1000)
    );

    const attemptRecord: MiniRetoAttemptRecord = {
      attemptId: `RETO-ATT-${student.id}-M${activeReto.modulo}-I${currentAttemptNum}-${Date.now()}`,
      fecha: new Date().toLocaleString('es-CO'),
      timestampMs: Date.now(),
      studentId: student.id,
      studentName: student.nombre,
      modulo: activeReto.modulo,
      intentoNumero: currentAttemptNum,
      mecanicaId: activeReto.mecanicaId,
      mecanicaNombre: activeReto.mecanicaNombre,
      familia: activeReto.familia,
      sourceQuestionId: activeReto.sourceQuestionId,
      tituloReto: activeReto.tituloReto,
      narrativaEscenario: activeReto.narrativaEscenario,
      preguntaReto: activeReto.preguntaReto,
      respuestaEsperadaDocente: activeReto.respuestaEsperadaDocente,
      conceptosClave: Array.isArray(activeReto.conceptosClave) ? activeReto.conceptosClave : [],
      respuestaEstudiante: cleanAnswer,
      porcentajeIA: finalEvaluation.porcentajeIA,
      umbralAprobacionPct: effectiveThreshold,
      rubricaDesglose: finalEvaluation.rubricaDesglose,
      aprobado: finalEvaluation.aprobado,
      suspendidoPorTrampa: false,
      notaEquivalenteEscala5: Number(((finalEvaluation.porcentajeIA / 100) * 5.0).toFixed(1)),
      advertenciasRegistradas: retoWarningsCount,
      maxLlamadosPermitidosEnIntento: maxLlamadosPermitidos,
      historialLlamadosIntento: retoWarningHistoryRef.current,
      telemetriaEscritura: {
        wpm: rewriteAudit.wpm,
        correccionesBackspace: backspaceCountRef.current,
        desviacionCadenciaMs: rewriteAudit.stdDevMs,
        sospechaReescrituraCopia: false
      },
      tiempoEmpleadoSegundos: elapsedRetoSec,
      retroalimentacionIA: finalEvaluation.retroalimentacionIA,
      pistaSocratica: finalEvaluation.pistaSocratica,
      modoEvaluacion: finalEvaluation.modoEvaluacion
    };

    const newIntentosUsados = Math.min(3, modProg.intentosUsados + 1);
    const wonBadge = finalEvaluation.aprobado;
    const exhaustedAllThree = !wonBadge && newIntentosUsados >= 3;

    const updatedModProgress: StudentRetoModuleProgress = {
      modulo: activeReto.modulo,
      intentosUsados: newIntentosUsados,
      maxIntentos: 3,
      insigniaDesbloqueada: modProg.insigniaDesbloqueada || wonBadge,
      fechaDesbloqueo: wonBadge ? attemptRecord.fecha : modProg.fechaDesbloqueo,
      mejorPorcentaje: Math.max(modProg.mejorPorcentaje || 0, finalEvaluation.porcentajeIA),
      bloqueadoPorFallo: exhaustedAllThree,
      preguntasRetoUsadas: Array.from(
        new Set([...modProg.preguntasRetoUsadas, activeReto.sourceQuestionId])
      ),
      mecanicasUsadas: Array.from(new Set([...modProg.mecanicasUsadas, activeReto.mecanicaId])),
      historialIntentos: [attemptRecord, ...modProg.historialIntentos]
    };

    const nextProgresoRetos: Record<1 | 2 | 3 | 4 | 5, StudentRetoModuleProgress> = {
      ...retoProgressMap,
      [activeReto.modulo]: updatedModProgress
    };

    const prevHistorialGlobal = Array.isArray(student.historialIntentosRetos)
      ? student.historialIntentosRetos
      : [];

    const updatedStudent: StudentRecord = {
      ...student,
      progresoRetos: nextProgresoRetos,
      historialIntentosRetos: [attemptRecord, ...prevHistorialGlobal]
    };

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    if (onRecordRetoAttempt) {
      onRecordRetoAttempt(student.id, attemptRecord, updatedStudent);
    } else {
      onUpdateStudentProfile(updatedStudent);
    }
    void handleExecuteServerSave(
      'estudiante_vitrina_insignias',
      `Actualización automática de Mini Reto M${activeReto.modulo} (${finalEvaluation.porcentajeIA}%) en Base de Datos del Servidor`
    );
    setLastAttemptResult(attemptRecord);
    setActiveReto(null);
    setIsEvaluating(false);
  };

  return (
    <div className="space-y-6 select-none">
      {/* 1. VITRINA DE INSIGNIAS (TROPHY ROOM) & MEDALLERO COLECCIONABLE (5/5 + DISTINCIÓN ESPECIAL) */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-slate-800 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-bold">
              <Trophy className="w-3.5 h-3.5" />
              <span>Vitrina Oficial de Insignias (Trophy Room) · Entorno Seguro Anti-Trampa</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Zona de Mini Retos Semánticos con IA & Medallero PRU
            </h2>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Supera un reto de razonamiento abierto con <strong>≥ {thresholdPct}% de afinidad semántica</strong> para desbloquear la Insignia Oficial de cada módulo. Cuenta con <strong>Escudo Anti-Trampa Activo</strong> (Regla de 1 Advertencia en cambio de foco y suspensión automática <code>0.0 / 5.0 SUSPENDIDO</code> en reincidencia, intento de copia/pegado o reescritura de texto copiado).
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-3 shrink-0">
            <div className="text-3xl">{allFiveUnlocked ? '🏆' : '🎖️'}</div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Progreso de Colección
              </div>
              <div className="text-lg font-extrabold text-amber-400 font-mono">
                {unlockedBadgesCount} / 5 Insignias
              </div>
              <div className="text-[11px] text-slate-300 font-mono">
                ✓ Desbloqueadas: <strong className="text-emerald-400">{unlockedBadgesCount}</strong> · ⏳ Pendientes: <strong className="text-amber-300">{5 - unlockedBadgesCount}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Grid of 5 Module Collectible Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {OFFICIAL_BADGES.map((badge) => {
            const prog = retoProgressMap[badge.modulo];
            const isUnlocked = prog.insigniaDesbloqueada;
            const isSuspended = Boolean(prog.suspendidoPorTrampa);
            const isDisabledByTeacher = blockedModulesForStudent.includes(badge.modulo);
            const isLockedByFail =
              !isUnlocked && (isSuspended || prog.bloqueadoPorFallo || prog.intentosUsados >= 3);
            const isSelected = selectedModulo === badge.modulo;

            return (
              <button
                key={badge.modulo}
                type="button"
                disabled={Boolean(activeReto)}
                onClick={() => {
                  setSelectedModulo(badge.modulo);
                  setActiveReto(null);
                  setLastAttemptResult(null);
                  setErrorMessage(null);
                }}
                className={`text-left p-4 rounded-xl border transition-all flex flex-col justify-between cursor-pointer ${
                  isUnlocked
                    ? isSelected
                      ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/60'
                      : 'bg-amber-500/10 border-amber-500/40 hover:border-amber-400'
                    : isSuspended
                    ? 'bg-red-950/70 border-red-500 ring-1 ring-red-500'
                    : isDisabledByTeacher
                    ? isSelected
                      ? 'bg-slate-900/90 border-slate-500 ring-2 ring-slate-400/50 opacity-85'
                      : 'bg-slate-900/60 border-slate-800 opacity-65'
                    : isLockedByFail
                    ? isSelected
                      ? 'bg-red-950/50 border-red-500 ring-2 ring-red-500/50'
                      : 'bg-slate-800/50 border-red-800/60 opacity-85'
                    : isSelected
                    ? 'bg-sky-500/20 border-sky-400 ring-2 ring-sky-400/50'
                    : 'bg-slate-800/70 border-slate-700 hover:border-slate-500'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-2xl">
                      {isUnlocked
                        ? badge.icono
                        : isSuspended
                        ? '🚨'
                        : isDisabledByTeacher
                        ? '🔒'
                        : isLockedByFail
                        ? '🔒'
                        : '🛡️'}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isUnlocked
                          ? 'bg-amber-400 text-slate-950'
                          : isSuspended
                          ? 'bg-red-600 text-white'
                          : isDisabledByTeacher
                          ? 'bg-slate-700 text-slate-300 border border-slate-600'
                          : isLockedByFail
                          ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                          : 'bg-sky-500/20 text-sky-200 border border-sky-400/30'
                      }`}
                    >
                      {isUnlocked
                        ? '🏅 DESBLOQUEADA'
                        : isSuspended
                        ? '0.0 SUSPENDIDO'
                        : isDisabledByTeacher
                        ? '🔒 INACTIVO DOCENTE'
                        : isLockedByFail
                        ? 'AGOTADO (3/3)'
                        : `⏳ PENDIENTE (${prog.intentosUsados}/3)`}
                    </span>
                  </div>

                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Módulo {badge.modulo}
                    </div>
                    <div
                      className={`text-xs font-bold leading-snug ${
                        isUnlocked ? 'text-amber-300' : 'text-white'
                      }`}
                    >
                      {badge.tituloPrincipal}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                      {badge.leyendaReconocimiento}
                    </p>
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-700/80 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Mejor afinidad:</span>
                  <span
                    className={`font-bold ${
                      isSuspended
                        ? 'text-red-400'
                        : prog.mejorPorcentaje >= thresholdPct
                        ? 'text-emerald-400'
                        : prog.mejorPorcentaje > 0
                        ? 'text-amber-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {isSuspended ? '0.0 / 5.0' : `${prog.mejorPorcentaje}%`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Distinción Especial (5/5) Banner */}
        <div
          className={`rounded-xl p-4 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            allFiveUnlocked
              ? 'bg-gradient-to-r from-amber-500/30 via-yellow-500/20 to-emerald-500/20 border-amber-400 text-white'
              : 'bg-slate-800/60 border-slate-700/80 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="text-3xl">{allFiveUnlocked ? '🏆' : '🔒'}</div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                Distinción Especial al Completar las 5 Insignias
              </div>
              <div className="text-sm font-extrabold text-white">
                {SPECIAL_DISTINCTION_BADGE.tituloPrincipal}
              </div>
              <div className="text-xs text-slate-300">{SPECIAL_DISTINCTION_BADGE.subtitulo}</div>
            </div>
          </div>
          <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700 shrink-0">
            {allFiveUnlocked
              ? '🌟 ¡COLECCIÓN COMPLETA DESBLOQUEADA!'
              : `Progreso actual: ${unlockedBadgesCount} de 5 módulos superados`}
          </div>
        </div>

        <OptionServerSaveBar
          sectionKey="estudiante_vitrina_insignias"
          label="Vitrina de Insignias y Progreso de Mini Retos"
          autoSave={true}
          watchValue={{
            progresoRetos: student.progresoRetos,
            histLen: (student.historialIntentosRetos || []).length
          }}
          dark={true}
        />
      </div>

      {/* 2. CONTROL DE DISPONIBILIDAD O SUSPENSIÓN ANTI-TRAMPA */}
      {!accessStatus.allowed && (
        <div
          className={`border-2 rounded-2xl p-5 flex items-start gap-3 text-xs ${
            student.suspendido
              ? 'bg-red-50 border-red-400 text-red-950'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          {student.suspendido ? (
            <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          ) : (
            <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-bold text-sm">
              {student.suspendido
                ? '🚨 Evaluación y Mini Retos Suspendidos por Infracción Anti-Trampa (Calificación: 0.0 / 5.0 — SUSPENDIDO)'
                : 'Participación en Mini Retos Restringida en este Momento'}
            </div>
            <p className="leading-relaxed">{accessStatus.reason}</p>
          </div>
        </div>
      )}

      {/* 3. ÁREA ACTIVA DEL MÓDULO SELECCIONADO */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
                MÓDULO {selectedModulo}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-sky-50 text-sky-900 border border-sky-200 text-xs font-semibold">
                {currentBadgeDef.icono} Insignia en Juego: «{currentBadgeDef.tituloPrincipal}»
              </span>
              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-mono">
                Umbral requerido: ≥ {thresholdPct}%
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 pt-1">
              {currentBadgeDef.subtitulo} — {currentBadgeDef.leyendaReconocimiento}
            </h3>
          </div>

          {/* Selector de Mecánica o Sorteo Aleatorio */}
          {!currentModProgress.insigniaDesbloqueada &&
            !currentModProgress.bloqueadoPorFallo &&
            !currentModProgress.suspendidoPorTrampa &&
            !isSelectedModuloDisabledByTeacher &&
            currentModProgress.intentosUsados < 3 &&
            accessStatus.allowed && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedMechanicFilter}
                  disabled={Boolean(activeReto)}
                  onChange={(e) =>
                    setSelectedMechanicFilter(e.target.value as MiniRetoMechanicId | 'random')
                  }
                  className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 bg-slate-50"
                >
                  <option value="random">🎲 Mecánica Aleatoria (12 Dinámicas Disponibles)</option>
                  {MINI_RETO_MECHANICS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.icono} {m.nombre} ({m.familia})
                    </option>
                  ))}
                </select>

                {!activeReto && (
                  <button
                    type="button"
                    disabled={isGeneratingReto || isEvaluating}
                    onClick={() => handleStartOrRenewReto(selectedModulo)}
                    className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    {isGeneratingReto ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Generando Mini Reto...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>
                          Iniciar Intento {currentModProgress.intentosUsados + 1} de 3 (Modo Seguro)
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
        </div>

        {/* Estado 1: Módulo ya conquistado (Muerte Súbita Positiva) */}
        {currentModProgress.insigniaDesbloqueada && (
          <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-6 space-y-3">
            <div className="flex items-start gap-3">
              <div className="text-4xl">{currentBadgeDef.icono}</div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>¡GANADOR! · RETO SUPERADO — INSIGNIA OBTENIDA</span>
                </div>
                <h4 className="text-lg font-extrabold text-emerald-950">
                  Insignia «{currentBadgeDef.tituloPrincipal}» Desbloqueada
                </h4>
                <p className="text-xs text-emerald-900 leading-relaxed">
                  Superaste este módulo con una calificación semántica de{' '}
                  <strong>{currentModProgress.mejorPorcentaje}%</strong> en el intento{' '}
                  <strong>{currentModProgress.intentosUsados} de 3</strong> (
                  {currentModProgress.fechaDesbloqueo || 'Registro Oficial'}). Por regla de «Muerte Súbita Positiva», tu insignia ya está asegurada en tu vitrina y este módulo queda completado.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Estado 2: Suspendido por Trampa (0.0 / 5.0 SUSPENDIDO) */}
        {!currentModProgress.insigniaDesbloqueada && currentModProgress.suspendidoPorTrampa && (
          <div className="bg-red-50 border-2 border-red-500 rounded-2xl p-6 space-y-2">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-extrabold text-red-950">
                  🚨 MÓDULO SUSPENDIDO POR INFRACCIÓN ANTI-TRAMPA — Calificación: 0.0 / 5.0 (SUSPENDIDO)
                </div>
                <p className="text-xs text-red-900 leading-relaxed">
                  Motivo registrado en auditoría: <strong>{currentModProgress.motivoSuspensionReto}</strong>. Solicita autorización y desbloqueo manual al docente en el aula.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Estado 2.B: Módulo Deshabilitado Específicamente por el Docente para este Estudiante */}
        {!currentModProgress.insigniaDesbloqueada &&
          !currentModProgress.suspendidoPorTrampa &&
          isSelectedModuloDisabledByTeacher && (
            <div className="bg-slate-100 border-2 border-slate-300 rounded-2xl p-6 space-y-3">
              <div className="flex items-start gap-3">
                <Lock className="w-6 h-6 text-slate-700 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <div className="text-sm font-bold text-slate-900">
                    🔒 Módulo {selectedModulo} Deshabilitado por el Docente para tu Sesión
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    El docente ha restringido temporalmente la participación en los Mini Retos del{' '}
                    <strong>Módulo {selectedModulo} ({currentBadgeDef.tituloPrincipal})</strong> para tu código de estudiante.
                  </p>
                  {enabledModulesForStudent.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs font-bold text-slate-800">
                        Módulos habilitados para ti:
                      </span>
                      {enabledModulesForStudent.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setSelectedModulo(m);
                            setErrorMessage(null);
                          }}
                          className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
                        >
                          Ir al Módulo {m} ({OFFICIAL_BADGES[m - 1].icono})
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-red-700">
                      Actualmente tienes los 5 módulos de retos deshabilitados. Consulta con el docente.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

        {/* Estado 3: Intentos agotados (3/3 sin alcanzar el 60%) */}
        {!currentModProgress.insigniaDesbloqueada &&
          !currentModProgress.suspendidoPorTrampa &&
          (currentModProgress.bloqueadoPorFallo || currentModProgress.intentosUsados >= 3) && (
            <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-6 space-y-2">
              <div className="flex items-start gap-3">
                <Lock className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-red-900">
                    🔒 Intentos Agotados (3/3) — Módulo No Superado Temporalmente
                  </div>
                  <p className="text-xs text-red-800 leading-relaxed">
                    Has utilizado tus 3 intentos en el Módulo {selectedModulo} (Mejor porcentaje alcanzado:{' '}
                    <strong>{currentModProgress.mejorPorcentaje}%</strong> vs. {thresholdPct}% requerido). Te sugerimos repasar los conceptos de la guía de estudio antes de solicitar una nueva convocatoria al docente.
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* Mensaje de error de validación */}
        {errorMessage && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex items-center gap-2 text-xs text-amber-950 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tarjeta del Reto Activo y Formulario de Respuesta Abierta con Escudo Anti-Trampa */}
        {activeReto && !currentModProgress.insigniaDesbloqueada && accessStatus.allowed && (
          <div
            onCopy={(e) => {
              if (!isRetoCopyPasteGuardEnabled) return;
              e.preventDefault();
              executeAntiCheatRetoSuspension(
                'Intento directo de copiar el enunciado del Mini Reto (Evento onCopy)',
                retoWarningsCountRef.current + 1
              );
            }}
            onCut={(e) => {
              if (!isRetoCopyPasteGuardEnabled) return;
              e.preventDefault();
              executeAntiCheatRetoSuspension(
                'Intento directo de cortar texto en el Mini Reto (Evento onCut)',
                retoWarningsCountRef.current + 1
              );
            }}
            className="border-2 border-sky-500 bg-sky-50/30 rounded-2xl p-6 space-y-5 select-none"
          >
            {/* Barra Superior de Telemetría Anti-Trampa del Mini Reto */}
            <div className="bg-slate-900 text-white rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-semibold ${
                    isRetoAntiCheatMasterEnabled
                      ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                      : 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    {isRetoAntiCheatMasterEnabled
                      ? '🛡️ Escudo Anti-Trampa Activo'
                      : '⚠️ Modo Flexible (Anti-Trampa Pausado por Docente)'}
                  </span>
                </span>
                {isRetoFocusGuardEnabled && (
                  <span
                    className={`px-2.5 py-1 rounded-md font-mono font-bold ${
                      retoWarningsCount === 0
                        ? 'bg-slate-800 text-slate-300'
                        : 'bg-amber-500 text-slate-950 animate-pulse'
                    }`}
                  >
                    Advertencias Foco: {retoWarningsCount} / 1
                  </span>
                )}
                {isRetoCopyPasteGuardEnabled && (
                  <span className="px-2 py-1 rounded-md bg-slate-800 text-emerald-300 font-mono text-[11px]">
                    ✓ Anti-Copia/Pegado Activo
                  </span>
                )}
                {isRetoBiometricGuardEnabled && (
                  <span className="px-2.5 py-1 rounded-md bg-slate-800 text-sky-300 font-mono">
                    Biometría: {liveKeystrokeStats.wpm} PPM · {liveKeystrokeStats.backspaces} edic.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 font-mono">
                <Clock className="w-4 h-4 text-amber-400" />
                <span
                  className={`font-bold ${
                    retoTimeLeftSec <= 90 ? 'text-red-400 animate-pulse' : 'text-white'
                  }`}
                >
                  Tiempo del Reto: {Math.floor(retoTimeLeftSec / 60)}:
                  {String(retoTimeLeftSec % 60).padStart(2, '0')}
                </span>
              </div>
            </div>

            {isSplitScreen && (
              <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-3 flex items-center gap-2 text-xs text-amber-950 font-bold">
                <Maximize2 className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  ⚠️ Ventana Dividida Detectada (&lt;85%): Maximiza tu ventana para evitar suspensión automática por pérdida de foco.
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-md bg-sky-900 text-white text-xs font-bold">
                  {activeReto.mecanicaNombre}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-white border border-sky-200 text-sky-900 text-xs font-semibold">
                  Familia: {activeReto.familia}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-xs font-mono">
                  Tema: {activeReto.tema}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-sky-900 bg-sky-100 px-3 py-1 rounded-full">
                Intento en Curso: {currentModProgress.intentosUsados + 1} de 3
              </span>
            </div>

            <div className="space-y-3 select-none">
              <h4 className="text-base font-extrabold text-slate-900">{activeReto.tituloReto}</h4>

              <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-800 leading-relaxed whitespace-pre-line shadow-2xs select-none">
                {activeReto.narrativaEscenario}
              </div>

              <div className="bg-indigo-950 text-white rounded-xl p-4 space-y-1.5 select-none">
                <div className="text-[11px] font-mono uppercase tracking-wider text-indigo-300 font-semibold">
                  🎯 Pregunta Abierta del Mini Reto (Prohibido Copiar / Pegar / Transcribir)
                </div>
                <p className="text-sm font-semibold leading-relaxed">{activeReto.preguntaReto}</p>
              </div>
            </div>

            {/* Botón de Pista Opcional */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowHint((prev) => !prev)}
                className="px-3.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                <span>{showHint ? 'Ocultar Pista Conceptual' : '💡 Ver Pista Opcional'}</span>
              </button>

              <span className="text-[11px] text-slate-500 font-mono">
                Rúbrica Semántica: 40% Concepto Clave · 40% Argumentación · 20% Explicación Propia (Feynman)
              </span>
            </div>

            {showHint && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Pista Conceptual:</strong> {activeReto.pistaOpcional}
                </div>
              </div>
            )}

            {/* Formulario de Respuesta Abierta con Bloqueo y Suspensión en Copia, Pegado o Reescritura */}
            <form onSubmit={handleEvaluateResponse} className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="studentOpenAnswer"
                    className="block text-xs font-bold text-slate-900"
                  >
                    Tu Argumento y Respuesta Abierta (Redacción Propia Verificada por Biometría de Tecleo):
                  </label>
                  <span
                    className={`text-xs font-mono font-semibold ${
                      wordCount >= 12 ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {wordCount} palabras
                  </span>
                </div>

                <textarea
                  id="studentOpenAnswer"
                  rows={4}
                  required
                  disabled={isEvaluating}
                  value={studentAnswer}
                  onKeyDown={handleTextareaKeyDown}
                  onChange={handleTextareaChange}
                  onPaste={(e) => {
                    if (!isRetoCopyPasteGuardEnabled) return;
                    e.preventDefault();
                    executeAntiCheatRetoSuspension(
                      'Intento de pegar texto copiado en la respuesta del Mini Reto (Evento onPaste)',
                      retoWarningsCountRef.current + 1
                    );
                  }}
                  onDrop={(e) => {
                    if (!isRetoCopyPasteGuardEnabled) return;
                    e.preventDefault();
                    executeAntiCheatRetoSuspension(
                      'Intento de arrastrar y soltar texto externo en el Mini Reto (Evento onDrop)',
                      retoWarningsCountRef.current + 1
                    );
                  }}
                  onCopy={(e) => {
                    if (!isRetoCopyPasteGuardEnabled) return;
                    e.preventDefault();
                    executeAntiCheatRetoSuspension(
                      'Intento de copiar texto dentro del Mini Reto (Evento onCopy)',
                      retoWarningsCountRef.current + 1
                    );
                  }}
                  placeholder="Escribe aquí tu respuesta con tus propias palabras. Recuerda: Ctrl+C, Ctrl+V, F12, PrintScreen, cambiar de pestaña 2 veces o reescribir texto copiado suspende automáticamente con 0.0 / 5.0..."
                  className="w-full p-3.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-slate-500">
                  🔒 Cualquier intento de copiar, pegar o reescribir texto copiado anula el reto con{' '}
                  <strong>0.0 / 5.0 (SUSPENDIDO)</strong>.
                </span>

                <button
                  type="submit"
                  disabled={isEvaluating || studentAnswer.trim().length < 8}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shrink-0"
                >
                  {isEvaluating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Analizando tu argumento con IA Semántica...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Enviar Respuesta para Veredicto Semántico</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tarjeta de Veredicto de la IA o de Suspensión Anti-Trampa */}
        {lastAttemptResult && (
          <div
            className={`rounded-2xl p-6 border-2 space-y-4 ${
              lastAttemptResult.suspendidoPorTrampa
                ? 'bg-red-50/90 border-red-500'
                : lastAttemptResult.aprobado
                ? 'bg-emerald-50/70 border-emerald-400'
                : 'bg-amber-50/70 border-amber-400'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2.5">
                {lastAttemptResult.suspendidoPorTrampa ? (
                  <ShieldAlert className="w-6 h-6 text-red-600 shrink-0" />
                ) : lastAttemptResult.aprobado ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                )}
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider font-bold text-slate-600">
                    Veredicto Semántico · Intento {lastAttemptResult.intentoNumero} de 3 ·{' '}
                    {lastAttemptResult.modoEvaluacion === 'ANTI_TRAMPA_SUSPENDIDO'
                      ? '🚨 Sanción Automática Anti-Trampa'
                      : lastAttemptResult.modoEvaluacion === 'IA_GEMINI'
                      ? '🤖 IA Semántica Gemini'
                      : '⚡ Evaluador Semántico Local (Respaldo Offline)'}
                  </div>
                  <h4 className="text-base font-extrabold text-slate-900">
                    {lastAttemptResult.suspendidoPorTrampa
                      ? '🚨 SUSPENDIDO POR INFRACCIÓN ANTI-TRAMPA — Calificación: 0.0 / 5.0 (SUSPENDIDO)'
                      : lastAttemptResult.aprobado
                      ? `¡MINI RETO SUPERADO CON ${lastAttemptResult.porcentajeIA}%! Insignia Desbloqueada`
                      : `Afinidad alcanzada: ${lastAttemptResult.porcentajeIA}% (Se requiere ≥ ${lastAttemptResult.umbralAprobacionPct}%)`}
                  </h4>
                </div>
              </div>

              <div
                className={`px-4 py-2 rounded-xl font-mono text-lg font-extrabold shrink-0 ${
                  lastAttemptResult.suspendidoPorTrampa
                    ? 'bg-red-600 text-white'
                    : lastAttemptResult.aprobado
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-200 text-amber-950'
                }`}
              >
                {lastAttemptResult.suspendidoPorTrampa
                  ? '0.0 / 5.0 (0%)'
                  : `${lastAttemptResult.porcentajeIA}% / 100%`}
              </div>
            </div>

            {/* Desglose de Rúbrica Semántica (40% Concepto / 40% Argumentación / 20% Feynman) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl p-3 border border-slate-200">
                <div className="text-[11px] text-slate-500 font-semibold">
                  1. Concepto Clave (Máx. 40%)
                </div>
                <div className="text-base font-extrabold text-slate-900 font-mono">
                  {lastAttemptResult.rubricaDesglose.conceptoClavePct}% / 40%
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-slate-200">
                <div className="text-[11px] text-slate-500 font-semibold">
                  2. Argumentación Teórica (Máx. 40%)
                </div>
                <div className="text-base font-extrabold text-slate-900 font-mono">
                  {lastAttemptResult.rubricaDesglose.argumentacionTeoricaPct}% / 40%
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-slate-200">
                <div className="text-[11px] text-slate-500 font-semibold">
                  3. Originalidad / Feynman (Máx. 20%)
                </div>
                <div className="text-base font-extrabold text-slate-900 font-mono">
                  {lastAttemptResult.rubricaDesglose.originalidadFeynmanPct}% / 20%
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-2 text-xs text-slate-800">
              <div>
                <strong className="text-slate-900">Dictamen Oficial:</strong>{' '}
                {lastAttemptResult.retroalimentacionIA}
              </div>
              {!lastAttemptResult.aprobado &&
                !lastAttemptResult.suspendidoPorTrampa &&
                lastAttemptResult.pistaSocratica && (
                  <div className="pt-2 border-t border-slate-100 text-amber-900">
                    <strong>🧭 Pista Socrática para tu próximo intento (sin revelar la respuesta):</strong>{' '}
                    {lastAttemptResult.pistaSocratica}
                  </div>
                )}
            </div>

            {!lastAttemptResult.aprobado &&
              !lastAttemptResult.suspendidoPorTrampa &&
              currentModProgress.intentosUsados < 3 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleStartOrRenewReto(selectedModulo)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>
                      Pasar al Intento {currentModProgress.intentosUsados + 1} de 3 (Nuevo Reto Aleatorio)
                    </span>
                  </button>
                </div>
              )}
          </div>
        )}

        {/* Estado inicial cuando no hay reto abierto y aún tiene intentos disponibles */}
        {!activeReto &&
          !lastAttemptResult &&
          !currentModProgress.insigniaDesbloqueada &&
          !currentModProgress.bloqueadoPorFallo &&
          !currentModProgress.suspendidoPorTrampa &&
          !isSelectedModuloDisabledByTeacher &&
          currentModProgress.intentosUsados < 3 &&
          accessStatus.allowed && (
            <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-6 text-center space-y-3">
              <div className="text-3xl">{currentBadgeDef.icono}</div>
              <div className="max-w-xl mx-auto space-y-1">
                <h4 className="text-sm font-bold text-slate-900">
                  ¿Listo para conquistar la Insignia «{currentBadgeDef.tituloPrincipal}»?
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Al hacer clic en <strong>«Iniciar Intento {currentModProgress.intentosUsados + 1} de 3 (Modo Seguro)»</strong>, se activará el entorno supervisado (pantalla completa, bloqueo de copia/pegado/atajos y biometría de escritura) y se sorteará un reactivo inédito del Módulo {selectedModulo}.
                </p>
              </div>
            </div>
          )}

        {/* Historial de Intentos del Estudiante en este Módulo */}
        {currentModProgress.historialIntentos.length > 0 && (
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Historial de Intentos en el Módulo {selectedModulo} ({currentModProgress.historialIntentos.length} / 3)
            </h4>
            <div className="space-y-2.5">
              {currentModProgress.historialIntentos.map((att) => (
                <div
                  key={att.attemptId}
                  className={`border rounded-xl p-3.5 text-xs space-y-1.5 ${
                    att.suspendidoPorTrampa
                      ? 'bg-red-50/70 border-red-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-slate-900">
                      Intento #{att.intentoNumero} · {att.mecanicaNombre} — {att.tituloReto}
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-500">{att.fecha}</span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          att.suspendidoPorTrampa
                            ? 'bg-red-600 text-white'
                            : att.aprobado
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {att.suspendidoPorTrampa
                          ? '0.0 / 5.0 (SUSPENDIDO)'
                          : `${att.porcentajeIA}% (${att.aprobado ? 'SUPERADO' : 'NO SUPERADO'})`}
                      </span>
                    </div>
                  </div>
                  <div className="text-slate-700">
                    <strong>Tu respuesta:</strong> «{att.respuestaEstudiante}»
                  </div>
                  <div className="text-slate-600">
                    <strong>Feedback / Auditoría:</strong> {att.retroalimentacionIA}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <OptionServerSaveBar
          sectionKey="estudiante_modulo_reto_activo"
          label={`Progreso de Mini Retos — Módulo ${selectedModulo}`}
          autoSave={true}
          watchValue={{
            modulo: selectedModulo,
            intentos: currentModProgress.intentosUsados,
            insignia: currentModProgress.insigniaDesbloqueada,
            mejorPct: currentModProgress.mejorPorcentaje
          }}
        />
      </div>

      {/* Modal de 1ª Advertencia Preventiva de Seguridad en Mini Retos */}
      {retoWarningModalText && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-amber-400 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-800">
              <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />
              <h4 className="text-base font-extrabold text-slate-900">
                1ª Advertencia Preventiva de Seguridad (Regla de 1 Advertencia)
              </h4>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">{retoWarningModalText}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  setRetoWarningModalText(null);
                  try {
                    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                      await document.documentElement.requestFullscreen();
                    }
                  } catch {
                    // ignore
                  }
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Entendido · Volver al Reto en Pantalla Completa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
