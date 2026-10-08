import React, { useState, useMemo } from 'react';
import {
  StudentRecord,
  Question,
  SystemConfig,
  CustomMiniRetoTemplate,
  MiniRetoAttemptRecord,
  MiniRetoMechanicId,
  StudentRetoModuleProgress
} from '../types';
import {
  OFFICIAL_BADGES,
  SPECIAL_DISTINCTION_BADGE,
  MINI_RETO_MECHANICS,
  generateLocalDynamicReto,
  getDefaultRetoProgress
} from '../utils/miniRetosEngine';
import { OptionServerSaveBar } from './ServerSaveContext';
import {
  Trophy,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  RotateCcw,
  Search,
  Filter,
  ShieldCheck,
  BarChart3,
  BookOpen,
  Sliders,
  Users,
  AlertTriangle
} from 'lucide-react';

interface TeacherMiniRetosManagerProps {
  students: StudentRecord[];
  onUpdateStudents: React.Dispatch<React.SetStateAction<StudentRecord[]>>;
  questions: Question[];
  config: SystemConfig;
  onUpdateConfig: React.Dispatch<React.SetStateAction<SystemConfig>>;
  customMiniRetos: CustomMiniRetoTemplate[];
  onUpdateCustomMiniRetos: React.Dispatch<React.SetStateAction<CustomMiniRetoTemplate[]>>;
}

const DAYS_OF_WEEK = [
  { day: 1, label: 'Lun' },
  { day: 2, label: 'Mar' },
  { day: 3, label: 'Mié' },
  { day: 4, label: 'Jue' },
  { day: 5, label: 'Vie' },
  { day: 6, label: 'Sáb' },
  { day: 0, label: 'Dom' }
];

export function TeacherMiniRetosManager({
  students,
  onUpdateStudents,
  questions,
  config,
  onUpdateConfig,
  customMiniRetos,
  onUpdateCustomMiniRetos
}: TeacherMiniRetosManagerProps) {
  const [subTab, setSubTab] = useState<'metricas_auditoria' | 'control_acceso' | 'banco_retos'>(
    'metricas_auditoria'
  );

  // Filters for Audit Table
  const [auditSearch, setAuditSearch] = useState('');
  const [auditModuloFilter, setAuditModuloFilter] = useState<number | 'ALL'>('ALL');
  const [auditStatusFilter, setAuditStatusFilter] = useState<'ALL' | 'APROBADO' | 'REPROBADO'>('ALL');

  // Manual Verdict Override Modal State
  const [overrideModalAttempt, setOverrideModalAttempt] = useState<MiniRetoAttemptRecord | null>(
    null
  );
  const [overridePctInput, setOverridePctInput] = useState<number>(60);
  const [overrideApprovedInput, setOverrideApprovedInput] = useState<boolean>(true);
  const [overrideNoteInput, setOverrideNoteInput] = useState<string>('');

  // Student Access Search, Selection & Bulk Module Control
  const [studentAccessSearch, setStudentAccessSearch] = useState('');
  const [studentAccessStatusFilter, setStudentAccessStatusFilter] = useState<
    'ALL' | 'HABILITADO' | 'BLOQUEADO' | 'MODULOS_PARCIALES'
  >('ALL');
  const [selectedAccessStudentIds, setSelectedAccessStudentIds] = useState<string[]>([]);
  const [bulkTargetModules, setBulkTargetModules] = useState<(1 | 2 | 3 | 4 | 5)[]>([
    1, 2, 3, 4, 5
  ]);
  const [crudModuloFilter, setCrudModuloFilter] = useState<number | 'ALL'>('ALL');

  // Custom Mini Reto Form State
  const [editingRetoId, setEditingRetoId] = useState<string | null>(null);
  const [formModulo, setFormModulo] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [formTema, setFormTema] = useState('Tema 2.2: Factores Sociales y Grupos de Referencia');
  const [formMecanicaId, setFormMecanicaId] = useState<MiniRetoMechanicId>('adivina_quien_soy');
  const [formTitulo, setFormTitulo] = useState('');
  const [formNarrativa, setFormNarrativa] = useState('');
  const [formPregunta, setFormPregunta] = useState('');
  const [formPista, setFormPista] = useState('');
  const [formRespuestaEsperada, setFormRespuestaEsperada] = useState('');
  const [formCriterio60, setFormCriterio60] = useState(
    'Supera el 60% si menciona el término técnico o si explica la idea central con sus propias palabras demostrando comprensión del fenómeno.'
  );
  const [formConceptosClave, setFormConceptosClave] = useState('');
  const [formUmbral, setFormUmbral] = useState<number>(60);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [confirmDeleteRetoAttemptId, setConfirmDeleteRetoAttemptId] = useState<string | null>(null);

  // Delete a specific Mini-Reto Attempt for a student and recalculate their module progress
  const handleDeleteSingleRetoAttempt = (
    studentId: string,
    attemptId: string,
    modulo: 1 | 2 | 3 | 4 | 5
  ) => {
    const threshold = Number(config.umbralAprobacionMiniRetoPct) || 60;
    onUpdateStudents((prev) =>
      prev.map((st) => {
        if (st.id !== studentId) return st;
        const baseMap = getDefaultRetoProgress();
        const currentProg = st.progresoRetos?.[modulo] || baseMap[modulo];
        const remainingModAttempts = (currentProg.historialIntentos || []).filter(
          (a) => a && a.attemptId !== attemptId
        );
        const remainingGlobal = (st.historialIntentosRetos || []).filter(
          (a) => a && a.attemptId !== attemptId
        );
        const bestPct =
          remainingModAttempts.length > 0
            ? Math.max(...remainingModAttempts.map((a) => Number(a.porcentajeIA) || 0))
            : 0;
        const anyApproved = remainingModAttempts.some(
          (a) => a.aprobado || Number(a.porcentajeIA) >= threshold
        );
        const anySuspended = remainingModAttempts.some((a) => Boolean(a.suspendidoPorTrampa));
        const usedCount = remainingModAttempts.length;

        const nextModProg: StudentRetoModuleProgress = {
          ...currentProg,
          modulo,
          intentosUsados: usedCount,
          maxIntentos: currentProg.maxIntentos || 3,
          insigniaDesbloqueada: anyApproved,
          mejorPorcentaje: bestPct,
          bloqueadoPorFallo: !anyApproved && usedCount >= (currentProg.maxIntentos || 3),
          suspendidoPorTrampa: anySuspended,
          motivoSuspensionReto: anySuspended ? currentProg.motivoSuspensionReto : undefined,
          preguntasRetoUsadas: remainingModAttempts.map((a) => a.sourceQuestionId).filter(Boolean),
          mecanicasUsadas: remainingModAttempts.map((a) => a.mecanicaId).filter(Boolean),
          historialIntentos: remainingModAttempts
        };

        return {
          ...st,
          progresoRetos: {
            ...baseMap,
            ...(st.progresoRetos || {}),
            [modulo]: nextModProg
          },
          historialIntentosRetos: remainingGlobal
        };
      })
    );
    setConfirmDeleteRetoAttemptId(null);
    setStatusBanner(
      `✓ Se eliminó el intento de reto (${attemptId}) del Módulo ${modulo} y se recalcularon los intentos del estudiante.`
    );
  };

  // Aggregate all attempts across students + badge metrics per module
  const metricsData = useMemo(() => {
    const badgesPerModule: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const failedLockPerModule: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0
    };
    let fullCollectionCount = 0;
    const allAttempts: MiniRetoAttemptRecord[] = [];
    const failedConceptsMap = new Map<
      string,
      { tema: string; modulo: number; fails: number; total: number }
    >();

    students.forEach((st) => {
      const prog = st.progresoRetos || {};
      let studentBadges = 0;
      ([1, 2, 3, 4, 5] as const).forEach((m) => {
        const mp = prog[m];
        if (mp?.insigniaDesbloqueada) {
          badgesPerModule[m]++;
          studentBadges++;
        } else if (mp?.bloqueadoPorFallo || (mp?.intentosUsados || 0) >= 3) {
          failedLockPerModule[m]++;
        }
        if (Array.isArray(mp?.historialIntentos)) {
          mp.historialIntentos.filter(Boolean).forEach((rawAtt) => {
            const att: MiniRetoAttemptRecord = {
              ...rawAtt,
              conceptosClave: Array.isArray(rawAtt.conceptosClave) ? rawAtt.conceptosClave : [],
              rubricaDesglose: rawAtt.rubricaDesglose || {
                conceptoClavePct: 0,
                argumentacionTeoricaPct: 0,
                originalidadFeynmanPct: 0
              }
            };
            allAttempts.push(att);
            const key = `M${att.modulo}-${att.tituloReto || 'Reto'}`;
            const curr = failedConceptsMap.get(key) || {
              tema: att.tituloReto || 'Reto',
              modulo: att.modulo,
              fails: 0,
              total: 0
            };
            curr.total += 1;
            if (!att.aprobado) curr.fails += 1;
            failedConceptsMap.set(key, curr);
          });
        }
      });
      if (studentBadges === 5) {
        fullCollectionCount++;
      }
    });

    allAttempts.sort((a, b) => b.timestampMs - a.timestampMs);

    const hardestTopics = Array.from(failedConceptsMap.values())
      .filter((x) => x.fails > 0)
      .sort((a, b) => b.fails - a.fails)
      .slice(0, 6);

    const totalBadgesDelivered =
      badgesPerModule[1] +
      badgesPerModule[2] +
      badgesPerModule[3] +
      badgesPerModule[4] +
      badgesPerModule[5];

    return {
      badgesPerModule,
      failedLockPerModule,
      fullCollectionCount,
      totalBadgesDelivered,
      allAttempts,
      hardestTopics
    };
  }, [students]);

  const filteredAttempts = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return metricsData.allAttempts.filter((att) => {
      if (auditModuloFilter !== 'ALL' && Number(att.modulo) !== auditModuloFilter) return false;
      if (auditStatusFilter === 'APROBADO' && !att.aprobado) return false;
      if (auditStatusFilter === 'REPROBADO' && att.aprobado) return false;
      if (!q) return true;
      return (
        att.studentName.toLowerCase().includes(q) ||
        att.studentId.toLowerCase().includes(q) ||
        att.tituloReto.toLowerCase().includes(q) ||
        att.respuestaEstudiante.toLowerCase().includes(q) ||
        att.mecanicaNombre.toLowerCase().includes(q)
      );
    });
  }, [metricsData.allAttempts, auditSearch, auditModuloFilter, auditStatusFilter]);

  // Helper: get list of disabled Mini Reto modules (1..5) for a student
  const getStudentBlockedModules = (st: StudentRecord): (1 | 2 | 3 | 4 | 5)[] => {
    const fromStudent = Array.isArray(st.modulosRetosBloqueados) ? st.modulosRetosBloqueados : [];
    const fromConfig = config.estudiantesModulosMiniRetosBloqueados?.[st.id] || [];
    return Array.from(new Set([...fromStudent, ...fromConfig])).sort() as (1 | 2 | 3 | 4 | 5)[];
  };

  // Filtered students in Section 3 (Control de Acceso por Estudiante y Módulos)
  const filteredAccessStudents = useMemo(() => {
    const q = studentAccessSearch.trim().toLowerCase();
    const blockedList = config.estudiantesSinMiniRetos || [];
    return students.filter((st) => {
      const isGeneralEnabled =
        config.miniRetosAbiertos !== false && !blockedList.includes(st.id);
      const blockedMods = getStudentBlockedModules(st);
      if (studentAccessStatusFilter === 'HABILITADO' && !isGeneralEnabled) return false;
      if (studentAccessStatusFilter === 'BLOQUEADO' && isGeneralEnabled) return false;
      if (
        studentAccessStatusFilter === 'MODULOS_PARCIALES' &&
        blockedMods.length === 0
      ) {
        return false;
      }
      if (!q) return true;
      return st.nombre.toLowerCase().includes(q) || st.id.toLowerCase().includes(q);
    });
  }, [
    students,
    studentAccessSearch,
    studentAccessStatusFilter,
    config.miniRetosAbiertos,
    config.estudiantesSinMiniRetos,
    config.estudiantesModulosMiniRetosBloqueados
  ]);

  // Toggle single module (1..5) enabled/disabled for a specific student
  const handleToggleStudentRetoModule = (studentId: string, mod: 1 | 2 | 3 | 4 | 5) => {
    onUpdateStudents((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        const curr = getStudentBlockedModules(s);
        const isBlocked = curr.includes(mod);
        const nextBlocked = isBlocked
          ? curr.filter((m) => m !== mod)
          : ([...curr, mod].sort() as (1 | 2 | 3 | 4 | 5)[]);
        return {
          ...s,
          modulosRetosBloqueados: nextBlocked
        };
      })
    );
    onUpdateConfig((prev) => {
      const map = { ...(prev.estudiantesModulosMiniRetosBloqueados || {}) };
      const targetStudent = students.find((x) => x.id === studentId);
      const curr = targetStudent ? getStudentBlockedModules(targetStudent) : map[studentId] || [];
      const isBlocked = curr.includes(mod);
      map[studentId] = isBlocked
        ? curr.filter((m) => m !== mod)
        : ([...curr, mod].sort() as (1 | 2 | 3 | 4 | 5)[]);
      return {
        ...prev,
        estudiantesModulosMiniRetosBloqueados: map
      };
    });
  };

  // Set all modules (M1..M5) enabled or disabled for a single student
  const handleSetAllModulesForSingleStudent = (studentId: string, enableAll: boolean) => {
    const nextBlocked: (1 | 2 | 3 | 4 | 5)[] = enableAll ? [] : [1, 2, 3, 4, 5];
    onUpdateStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, modulosRetosBloqueados: nextBlocked } : s))
    );
    onUpdateConfig((prev) => ({
      ...prev,
      estudiantesModulosMiniRetosBloqueados: {
        ...(prev.estudiantesModulosMiniRetosBloqueados || {}),
        [studentId]: nextBlocked
      }
    }));
  };

  // Bulk Enable or Disable General Mini Retos Access for target Student IDs
  const handleBulkGeneralAccess = (targetStudentIds: string[], enable: boolean) => {
    if (targetStudentIds.length === 0) {
      setStatusBanner('⚠️ Selecciona al menos un estudiante primero para aplicar la acción masiva.');
      return;
    }
    const targetSet = new Set(targetStudentIds);
    onUpdateConfig((prev) => {
      const currentBlocked = new Set(prev.estudiantesSinMiniRetos || []);
      // If global was false and we are enabling a subset, mark others as blocked first
      if (prev.miniRetosAbiertos === false && enable) {
        students.forEach((s) => currentBlocked.add(s.id));
      }
      targetSet.forEach((id) => {
        if (enable) {
          currentBlocked.delete(id);
        } else {
          currentBlocked.add(id);
        }
      });
      return {
        ...prev,
        miniRetosAbiertos: true,
        estudiantesSinMiniRetos: Array.from(currentBlocked)
      };
    });
    setStatusBanner(
      `✓ Acceso general a Mini Retos ${
        enable ? 'HABILITADO' : 'DESHABILITADO'
      } para ${targetStudentIds.length} estudiante(s).`
    );
  };

  // Bulk Enable or Disable specific Modules (M1..M5) for target Student IDs
  const handleBulkModulesForStudents = (
    targetStudentIds: string[],
    modulesToChange: (1 | 2 | 3 | 4 | 5)[],
    enableModules: boolean
  ) => {
    if (targetStudentIds.length === 0) {
      setStatusBanner('⚠️ Selecciona al menos un estudiante primero para editar sus módulos de retos.');
      return;
    }
    if (modulesToChange.length === 0) {
      setStatusBanner('⚠️ Marca al menos un módulo (M1 a M5) en el selector de módulos.');
      return;
    }
    const targetSet = new Set(targetStudentIds);

    onUpdateStudents((prev) =>
      prev.map((s) => {
        if (!targetSet.has(s.id)) return s;
        const currBlocked = new Set(getStudentBlockedModules(s));
        modulesToChange.forEach((m) => {
          if (enableModules) {
            currBlocked.delete(m);
          } else {
            currBlocked.add(m);
          }
        });
        return {
          ...s,
          modulosRetosBloqueados: Array.from(currBlocked).sort() as (1 | 2 | 3 | 4 | 5)[]
        };
      })
    );

    onUpdateConfig((prev) => {
      const map = { ...(prev.estudiantesModulosMiniRetosBloqueados || {}) };
      students.forEach((s) => {
        if (!targetSet.has(s.id)) return;
        const currBlocked = new Set(getStudentBlockedModules(s));
        modulesToChange.forEach((m) => {
          if (enableModules) {
            currBlocked.delete(m);
          } else {
            currBlocked.add(m);
          }
        });
        map[s.id] = Array.from(currBlocked).sort() as (1 | 2 | 3 | 4 | 5)[];
      });
      return {
        ...prev,
        estudiantesModulosMiniRetosBloqueados: map
      };
    });

    setStatusBanner(
      `✓ Módulos [${modulesToChange.map((m) => `M${m}`).join(', ')}] ${
        enableModules ? 'HABILITADOS' : 'DESHABILITADOS'
      } para ${targetStudentIds.length} estudiante(s).`
    );
  };

  // Reset a student's 3 attempts and clear any anti-cheat suspension for a specific module
  const handleResetStudentModuleAttempts = (studentId: string, modulo: 1 | 2 | 3 | 4 | 5) => {
    onUpdateStudents((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;
        const defaults = getDefaultRetoProgress();
        const currentProg = s.progresoRetos || defaults;
        const existingMod = currentProg[modulo] || defaults[modulo];
        return {
          ...s,
          suspendido: false,
          conceptoInfraccion: '✓ Sin infracciones (Desbloqueado por Docente)',
          progresoRetos: {
            ...defaults,
            ...currentProg,
            [modulo]: {
              ...existingMod,
              intentosUsados: 0,
              bloqueadoPorFallo: false,
              suspendidoPorTrampa: false,
              motivoSuspensionReto: undefined
            }
          }
        };
      })
    );
    setStatusBanner(
      `✓ Se reinició el contador de intentos (0/3) y se levantó cualquier bloqueo anti-trampa del Módulo ${modulo} para el estudiante ${studentId}.`
    );
  };

  // Manual Teacher Verdict Override
  const handleSaveManualOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideModalAttempt) return;

    const targetStudentId = overrideModalAttempt.studentId;
    const targetMod = overrideModalAttempt.modulo;
    const targetAttemptId = overrideModalAttempt.attemptId;

    onUpdateStudents((prev) =>
      prev.map((s) => {
        if (s.id !== targetStudentId) return s;
        const defaults = getDefaultRetoProgress();
        const currentProg = s.progresoRetos || defaults;
        const modProg = currentProg[targetMod] || defaults[targetMod];

        const updatedHistory = (modProg.historialIntentos || []).map((att) => {
          if (att.attemptId !== targetAttemptId) return att;
          return {
            ...att,
            porcentajeIA: overridePctInput,
            aprobado: overrideApprovedInput,
            modoEvaluacion: 'AJUSTE_DOCENTE' as const,
            ajustadoPorDocente: true,
            notaAjusteDocente:
              overrideNoteInput.trim() || 'Veredicto ajustado manualmente por el docente.'
          };
        });

        const anyApprovedNow = updatedHistory.some((h) => h.aprobado);
        const maxPctNow = updatedHistory.reduce((acc, h) => Math.max(acc, h.porcentajeIA), 0);

        const nextModProg: StudentRetoModuleProgress = {
          ...modProg,
          insigniaDesbloqueada: anyApprovedNow,
          fechaDesbloqueo: anyApprovedNow
            ? modProg.fechaDesbloqueo || new Date().toLocaleString('es-CO')
            : undefined,
          mejorPorcentaje: maxPctNow,
          bloqueadoPorFallo: !anyApprovedNow && modProg.intentosUsados >= 3,
          historialIntentos: updatedHistory
        };

        return {
          ...s,
          progresoRetos: {
            ...defaults,
            ...currentProg,
            [targetMod]: nextModProg
          }
        };
      })
    );

    setOverrideModalAttempt(null);
    setStatusBanner('✓ Veredicto e insignia actualizados manualmente por el docente.');
  };

  // Save or Update Custom Teacher Mini Reto Template
  const handleSaveCustomReto = (e: React.FormEvent) => {
    e.preventDefault();
    const mech =
      MINI_RETO_MECHANICS.find((m) => m.id === formMecanicaId) || MINI_RETO_MECHANICS[0];
    const cleanKeywords = formConceptosClave
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const newItem: CustomMiniRetoTemplate = {
      id: editingRetoId || `CUSTOM-RETO-${Date.now()}`,
      modulo: formModulo,
      tema: formTema.trim() || `Módulo ${formModulo}`,
      mecanicaId: mech.id,
      mecanicaNombre: mech.nombre,
      familia: mech.familia,
      titulo: formTitulo.trim() || `${mech.nombre} — Módulo ${formModulo}`,
      narrativa: formNarrativa.trim(),
      preguntaReto: formPregunta.trim(),
      pistaOpcional:
        formPista.trim() ||
        'Revisa los conceptos principales del módulo y explica la relación con tus propias palabras.',
      respuestaEsperada: formRespuestaEsperada.trim(),
      criterioEvaluacion60: formCriterio60.trim(),
      conceptosClave: cleanKeywords.length > 0 ? cleanKeywords : ['concepto', 'consumidor'],
      umbralAprobacionPct: Math.max(50, Math.min(95, Number(formUmbral) || 60)),
      activo: true
    };

    if (editingRetoId) {
      onUpdateCustomMiniRetos((prev) => prev.map((r) => (r.id === editingRetoId ? newItem : r)));
      setStatusBanner('✓ Plantilla de Mini Reto actualizada en el Banco Docente.');
    } else {
      onUpdateCustomMiniRetos((prev) => [newItem, ...prev]);
      setStatusBanner('✓ Nuevo Mini Reto agregado al Banco Docente.');
    }

    setEditingRetoId(null);
    setFormTitulo('');
    setFormNarrativa('');
    setFormPregunta('');
    setFormPista('');
    setFormRespuestaEsperada('');
    setFormConceptosClave('');
  };

  // Auto-fill form by sampling a random question from the 740 Question Bank
  const handleAutoDraftFromQuestionBank = () => {
    const modQuestions = questions.filter((q) => Number(q.modulo) === formModulo);
    if (modQuestions.length === 0) return;
    const randomQ = modQuestions[Math.floor(Math.random() * modQuestions.length)];
    const generated = generateLocalDynamicReto(randomQ, formMecanicaId, formUmbral);

    setFormTema(generated.tema);
    setFormTitulo(generated.tituloReto);
    setFormNarrativa(generated.narrativaEscenario);
    setFormPregunta(generated.preguntaReto);
    setFormPista(generated.pistaOpcional);
    setFormRespuestaEsperada(generated.respuestaEsperadaDocente);
    setFormCriterio60(generated.criterioEvaluacion60);
    setFormConceptosClave(generated.conceptosClave.join(', '));
    setStatusBanner(
      `✓ Plantilla pre-llenada automáticamente a partir del reactivo #${randomQ.id} del Banco de 740 Preguntas.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Encabezado Principal del Gestor de Mini Retos */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
            <Trophy className="w-3.5 h-3.5 text-amber-600" />
            <span>Gamificación Semántica con IA · 12 Mecánicas + Banco 740 Reactivos</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            Gestor Docente de Mini Retos & Auditoría de Insignias (5/5)
          </h2>
          <p className="text-xs text-slate-600">
            Supervisa las insignias entregadas por módulo, audita o ajusta el veredicto semántico de la IA, administra la disponibilidad horaria y crea plantillas personalizadas.
          </p>
        </div>

        {/* Sub-navegación del Gestor */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('metricas_auditoria')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              subTab === 'metricas_auditoria'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Métricas e Historial de Auditoría IA</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('control_acceso')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              subTab === 'control_acceso'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Control de Activación y Horarios</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('banco_retos')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              subTab === 'banco_retos'
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Banco de Mini Retos ({customMiniRetos.length})</span>
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl px-4 py-3 text-xs font-semibold text-emerald-950 flex items-center justify-between">
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-emerald-800 hover:underline font-bold ml-4"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* ================= SUB-TAB 1: MÉTRICAS DE INSIGNIAS Y AUDITORÍA DOCENTE ================= */}
      {subTab === 'metricas_auditoria' && (
        <div className="space-y-6">
          {/* Tarjetas de Insignias Entregadas por Módulo (1 al 5) + Colección Completa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {OFFICIAL_BADGES.map((badge) => {
              const count = metricsData.badgesPerModule[badge.modulo];
              const lockedCount = metricsData.failedLockPerModule[badge.modulo];
              return (
                <div
                  key={badge.modulo}
                  className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col justify-between space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{badge.icono}</span>
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      Módulo {badge.modulo}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 leading-snug">
                      {badge.tituloPrincipal}
                    </div>
                    <div className="text-xl font-extrabold text-emerald-700 font-mono mt-1">
                      {count} <span className="text-xs font-normal text-slate-500">entregadas</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono border-t border-slate-100 pt-1.5">
                    Agotados (3/3): <strong className="text-red-600">{lockedCount}</strong>
                  </div>
                </div>
              );
            })}

            {/* Tarjeta Distinción Especial 5/5 */}
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-300 rounded-xl p-4 shadow-2xs flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl">🏆</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                  COLECCIÓN 5/5
                </span>
              </div>
              <div>
                <div className="text-xs font-extrabold text-amber-950 leading-snug">
                  Maestro Estratega PRU
                </div>
                <div className="text-xl font-extrabold text-amber-800 font-mono mt-1">
                  {metricsData.fullCollectionCount}{' '}
                  <span className="text-xs font-normal text-amber-900">estudiantes</span>
                </div>
              </div>
              <div className="text-[11px] text-amber-900 font-mono border-t border-amber-200 pt-1.5">
                Total insignias: <strong>{metricsData.totalBadgesDelivered}</strong>
              </div>
            </div>
          </div>

          {/* Conceptos que más costó argumentar (Para refuerzo en clase presencial) */}
          {metricsData.hardestTopics.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <span>
                  Diagnóstico de Argumentación: Conceptos con Mayor Dificultad para Reforzar en Clase Presencial
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {metricsData.hardestTopics.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-amber-200 rounded-xl p-3 text-xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-amber-900">
                        Módulo {item.modulo}:
                      </span>{' '}
                      <span className="font-semibold text-slate-800">{item.tema}</span>
                    </div>
                    <span className="px-2 py-1 rounded bg-red-100 text-red-800 font-mono font-bold shrink-0">
                      {item.fails} fallos / {item.total} int.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matriz de Insignias por Estudiante y Reinicio Rápido de Módulos Bloqueados */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Vitrina de Insignias por Estudiante y Desbloqueo de Intentos (Módulos 1 al 5)
                </h3>
                <p className="text-xs text-slate-600">
                  Si un estudiante agotó sus 3 intentos en un módulo (🔒 3/3), puedes reiniciar su contador haciendo clic en el botón del módulo correspondiente.
                </p>
              </div>
            </div>

            <div className="w-full overflow-y-auto overflow-x-hidden max-h-80 border border-slate-200 rounded-xl bg-white">
              <table className="w-full table-auto text-left border-collapse text-[11px]">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10">
                  <tr>
                    <th className="py-2 px-2.5 font-bold">Estudiante (ID)</th>
                    <th className="py-2 px-2 font-bold text-center">M1: Cartógrafo 🧭</th>
                    <th className="py-2 px-2 font-bold text-center">M2: Psicólogo 🧠</th>
                    <th className="py-2 px-2 font-bold text-center">M3: Sherlock 🕵️‍♂️</th>
                    <th className="py-2 px-2 font-bold text-center">M4: Arquitecto 🎯</th>
                    <th className="py-2 px-2 font-bold text-center">M5: Omnicanal 🚀</th>
                    <th className="py-2 px-2.5 font-bold text-center">Total Colección</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {students.map((st) => {
                    const prog = st.progresoRetos || {};
                    const countUnlocked = ([1, 2, 3, 4, 5] as const).filter(
                      (m) => prog[m]?.insigniaDesbloqueada
                    ).length;

                    return (
                      <tr key={st.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium text-slate-900">
                          <div>{st.nombre}</div>
                          <div className="text-[11px] font-mono text-slate-500">{st.id}</div>
                        </td>
                        {([1, 2, 3, 4, 5] as const).map((m) => {
                          const mp = prog[m];
                          const won = Boolean(mp?.insigniaDesbloqueada);
                          const used = mp?.intentosUsados || 0;
                          const suspended = Boolean(mp?.suspendidoPorTrampa);
                          const locked = !won && (suspended || mp?.bloqueadoPorFallo || used >= 3);
                          const badgeIcon = OFFICIAL_BADGES[m - 1].icono;

                          return (
                            <td key={m} className="py-2 px-3 text-center font-mono">
                              <div className="flex flex-col items-center gap-1">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                    won
                                      ? 'bg-amber-100 text-amber-950 border border-amber-300'
                                      : suspended
                                      ? 'bg-red-600 text-white'
                                      : locked
                                      ? 'bg-red-100 text-red-800'
                                      : used > 0
                                      ? 'bg-sky-50 text-sky-900'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {won
                                    ? `${badgeIcon} ${mp?.mejorPorcentaje || 60}% (${used}/3)`
                                    : suspended
                                    ? `🚨 0.0 SUSPENDIDO`
                                    : locked
                                    ? `🔒 Agotado (3/3)`
                                    : `${used}/3 int.`}
                                </span>
                                {(locked || used > 0) && !won && (
                                  <button
                                    type="button"
                                    onClick={() => handleResetStudentModuleAttempts(st.id, m)}
                                    className="text-[10px] text-sky-700 hover:underline font-sans font-semibold cursor-pointer"
                                  >
                                    {suspended ? 'Desbloquear y Reiniciar' : 'Reiniciar 0/3'}
                                  </button>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 text-center font-mono font-bold">
                          {countUnlocked === 5 ? (
                            <span className="px-2.5 py-1 rounded-full bg-amber-300 text-slate-950">
                              🏆 5/5 Maestro
                            </span>
                          ) : (
                            <span className="text-slate-700">{countUnlocked} / 5</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabla de Resultados y Auditoría Docente (Respuesta Abierta, % IA, Justificación y Ajuste Manual) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Tabla de Auditoría Docente: Respuestas Abiertas y Calificación Semántica IA ({filteredAttempts.length})
                </h3>
                <p className="text-xs text-slate-600">
                  Revisa qué respondió cada estudiante con sus propias palabras, el porcentaje otorgado por la IA, su justificación y ajusta manualmente el veredicto si lo deseas.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Buscar estudiante o respuesta..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                  />
                </div>

                <select
                  value={auditModuloFilter}
                  onChange={(e) =>
                    setAuditModuloFilter(
                      e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  <option value="ALL">Todos los Módulos (1-5)</option>
                  <option value={1}>Módulo 1</option>
                  <option value={2}>Módulo 2</option>
                  <option value={3}>Módulo 3</option>
                  <option value={4}>Módulo 4</option>
                  <option value={5}>Módulo 5</option>
                </select>

                <select
                  value={auditStatusFilter}
                  onChange={(e) =>
                    setAuditStatusFilter(e.target.value as 'ALL' | 'APROBADO' | 'REPROBADO')
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  <option value="ALL">Todos los Veredictos</option>
                  <option value="APROBADO">🏅 Superados (≥ Umbral)</option>
                  <option value="REPROBADO">❌ No Superados (&lt; Umbral)</option>
                </select>
              </div>
            </div>

            {filteredAttempts.length === 0 ? (
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-xs text-slate-500">
                Aún no se registran respuestas abiertas de Mini Retos con los filtros seleccionados.
              </div>
            ) : (
              <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                {filteredAttempts.map((att) => (
                  <div
                    key={att.attemptId}
                    className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900">
                          {att.studentName} ({att.studentId})
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono font-bold">
                          Módulo {att.modulo} · Intento {att.intentoNumero}/3
                        </span>
                        <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-900 font-semibold">
                          {att.mecanicaNombre}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 font-mono font-bold border border-indigo-200">
                          ⏱️ Tiempo en reto:{' '}
                          {att.tiempoEmpleadoSegundos
                            ? `${Math.floor(att.tiempoEmpleadoSegundos / 60)}m ${att.tiempoEmpleadoSegundos % 60}s`
                            : '1m 20s'}
                        </span>
                        <span className="text-slate-500 font-mono">{att.fecha}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-md font-mono font-bold ${
                            att.suspendidoPorTrampa
                              ? 'bg-red-600 text-white'
                              : att.aprobado
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-amber-100 text-amber-950 border border-amber-300'
                          }`}
                        >
                          {att.suspendidoPorTrampa
                            ? '🚨 0.0 / 5.0 (SUSPENDIDO)'
                            : `${att.porcentajeIA}% (${att.aprobado ? '🏅 GANADOR' : 'NO SUPERADO'})`}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            setOverrideModalAttempt(att);
                            setOverridePctInput(att.porcentajeIA);
                            setOverrideApprovedInput(att.aprobado);
                            setOverrideNoteInput(att.notaAjusteDocente || '');
                          }}
                          className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Ajustar Veredicto</span>
                        </button>

                        {confirmDeleteRetoAttemptId === att.attemptId ? (
                          <div className="inline-flex items-center gap-1 bg-red-50 border border-red-300 px-2 py-0.5 rounded text-[11px]">
                            <span className="text-red-900 font-bold">¿Borrar intento del reto?</span>
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteSingleRetoAttempt(att.studentId, att.attemptId, att.modulo)
                              }
                              className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold cursor-pointer"
                            >
                              Sí, Borrar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteRetoAttemptId(null)}
                              className="px-2 py-0.5 bg-white border border-slate-300 text-slate-700 rounded cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteRetoAttemptId(att.attemptId)}
                            className="px-2.5 py-1 rounded-md border border-red-300 bg-red-50 hover:bg-red-100 text-red-800 font-bold flex items-center gap-1 cursor-pointer"
                            title="Borrar este intento del reto y devolver el intento al estudiante"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Borrar Intento del Reto</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">
                          Reto y Respuesta Esperada Docente
                        </div>
                        <div className="font-bold text-slate-900">{att.tituloReto}</div>
                        <div className="text-slate-700">{att.preguntaReto}</div>
                        <div className="pt-1 text-emerald-900 font-medium">
                          <strong>Esperada Docente:</strong> {att.respuestaEsperadaDocente}
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">
                          Respuesta Abierta del Estudiante & Justificación IA ({att.modoEvaluacion})
                        </div>
                        <div className="text-slate-900 font-medium bg-sky-50/60 p-2 rounded border border-sky-100">
                          «{att.respuestaEstudiante}»
                        </div>
                        <div className="text-slate-600 font-mono text-[11px]">
                          Rúbrica: Concepto {att.rubricaDesglose.conceptoClavePct}/40% · Argumento{' '}
                          {att.rubricaDesglose.argumentacionTeoricaPct}/40% · Feynman{' '}
                          {att.rubricaDesglose.originalidadFeynmanPct}/20%
                        </div>
                        {att.telemetriaEscritura && (
                          <div className="text-[11px] font-mono text-sky-900 bg-sky-50 px-2 py-1 rounded border border-sky-200">
                            Biometría de Tecleo: {att.telemetriaEscritura.wpm} PPM ·{' '}
                            {att.telemetriaEscritura.correccionesBackspace} correcciones Backspace ·
                            Cadencia ±{att.telemetriaEscritura.desviacionCadenciaMs}ms · Advertencias Foco:{' '}
                            {att.advertenciasRegistradas || 0}/1
                          </div>
                        )}
                        {att.suspendidoPorTrampa && att.motivoInfraccion && (
                          <div className="text-red-800 font-bold bg-red-50 px-2 py-1 rounded border border-red-200">
                            🚨 Motivo de Suspensión (0.0 / 5.0): {att.motivoInfraccion}
                          </div>
                        )}
                        <div className="text-slate-700">
                          <strong>Justificación IA:</strong> {att.retroalimentacionIA}
                        </div>
                        {att.ajustadoPorDocente && (
                          <div className="text-indigo-800 font-semibold">
                            ✓ Ajustado por Docente: {att.notaAjusteDocente}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <OptionServerSaveBar
              sectionKey="mini_retos_auditoria_resultados"
              label="Auditoría y Veredictos de Mini Retos"
              watchValue={students.map((s) => ({
                id: s.id,
                suspendido: s.suspendido,
                progreso: s.progresoRetos,
                histLen: (s.historialIntentosRetos || []).length
              }))}
            />
          </div>
        </div>
      )}

      {/* ================= SUB-TAB 2: CONTROL DE ACTIVACIÓN, POR ESTUDIANTE Y HORARIOS ================= */}
      {subTab === 'control_acceso' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Estado Global de Mini Retos y Umbral Semántico */}
            <div className="border border-slate-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-700" />
                <span>1. Estado Maestro de Mini Retos & Umbral de Aprobación IA</span>
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      miniRetosAbiertos: true,
                      estudiantesSinMiniRetos: []
                    }))
                  }
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    config.miniRetosAbiertos !== false &&
                    (config.estudiantesSinMiniRetos || []).length === 0
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  ✓ Habilitar Mini Retos para TODOS
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      miniRetosAbiertos: false,
                      estudiantesSinMiniRetos: students.map((s) => s.id)
                    }))
                  }
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    config.miniRetosAbiertos === false
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  🔒 Deshabilitar Mini Retos para TODOS
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  Umbral de Aprobación Semántica por Defecto (% requerido para ganar la insignia):
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={50}
                    max={95}
                    value={config.umbralAprobacionMiniRetoPct ?? 60}
                    onChange={(e) =>
                      onUpdateConfig((prev) => ({
                        ...prev,
                        umbralAprobacionMiniRetoPct: Math.max(
                          50,
                          Math.min(95, Number(e.target.value) || 60)
                        )
                      }))
                    }
                    className="w-24 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-mono font-bold"
                  />
                  <span className="text-xs text-slate-600">
                    % (Recomendado: <strong>60%</strong> · 40% Concepto + 40% Argumentación + 20% Feynman)
                  </span>
                </div>
              </div>
              <OptionServerSaveBar
                sectionKey="mini_retos_estado_maestro"
                label="Estado Maestro y Umbral de Mini Retos"
                watchValue={{
                  miniRetosAbiertos: config.miniRetosAbiertos,
                  umbral: config.umbralAprobacionMiniRetoPct,
                  blockedLen: (config.estudiantesSinMiniRetos || []).length
                }}
              />
            </div>

            {/* Restricción de Horario (Sin restricción vs Días y Horas disponibles) */}
            <div className="border border-slate-200 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-700" />
                <span>2. Programación Horaria de Mini Retos (Días y Horas)</span>
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      miniRetosSinRestriccionHora: true
                    }))
                  }
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    config.miniRetosSinRestriccionHora !== false
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  🌐 Sin Restricción de Hora (24/7)
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig((prev) => ({
                      ...prev,
                      miniRetosSinRestriccionHora: false,
                      miniRetosDiasPermitidos:
                        Array.isArray(prev.miniRetosDiasPermitidos) &&
                        prev.miniRetosDiasPermitidos.length > 0
                          ? prev.miniRetosDiasPermitidos
                          : [1, 2, 3, 4, 5, 6],
                      miniRetosHoraInicio: prev.miniRetosHoraInicio || '07:00',
                      miniRetosHoraFin: prev.miniRetosHoraFin || '22:00'
                    }))
                  }
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    config.miniRetosSinRestriccionHora === false
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  ⏰ Habilitar Restricción por Días y Horas
                </button>
              </div>

              {config.miniRetosSinRestriccionHora === false && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="space-y-1">
                    <span className="block text-xs font-semibold text-slate-700">
                      Días Habilitados:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS_OF_WEEK.map((d) => {
                        const activeDays = config.miniRetosDiasPermitidos || [];
                        const isSelected = activeDays.includes(d.day);
                        return (
                          <button
                            key={d.day}
                            type="button"
                            onClick={() => {
                              const next = isSelected
                                ? activeDays.filter((x) => x !== d.day)
                                : [...activeDays, d.day];
                              onUpdateConfig((prev) => ({
                                ...prev,
                                miniRetosDiasPermitidos: next
                              }));
                            }}
                            className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                              isSelected
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Hora de Inicio:
                      </label>
                      <input
                        type="time"
                        value={config.miniRetosHoraInicio || '07:00'}
                        onChange={(e) =>
                          onUpdateConfig((prev) => ({
                            ...prev,
                            miniRetosHoraInicio: e.target.value
                          }))
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Hora Límite (Fin):
                      </label>
                      <input
                        type="time"
                        value={config.miniRetosHoraFin || '22:00'}
                        onChange={(e) =>
                          onUpdateConfig((prev) => ({
                            ...prev,
                            miniRetosHoraFin: e.target.value
                          }))
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}
              <OptionServerSaveBar
                sectionKey="mini_retos_horario"
                label="Horario y Disponibilidad de Mini Retos"
                watchValue={{
                  sinRestriccion: config.miniRetosSinRestriccionHora,
                  dias: config.miniRetosDiasPermitidos,
                  inicio: config.miniRetosHoraInicio,
                  fin: config.miniRetosHoraFin
                }}
              />
            </div>
          </div>

          {/* Selección Individual y Masiva por Estudiante + Habilitación de Módulos de Retos (M1 a M5) */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  3. Control de Acceso a Mini Retos por Estudiante Individual y por Módulos (M1 a M5)
                </h4>
                <p className="text-xs text-slate-600">
                  Selecciona todos o algunos estudiantes para habilitar/deshabilitar su acceso general a Mini Retos, o elige qué módulos específicos (Módulo 1 al 5) tiene habilitados o deshabilitados cada estudiante.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentAccessSearch}
                    onChange={(e) => setStudentAccessSearch(e.target.value)}
                    placeholder="Filtrar estudiante por nombre o ID..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs w-56"
                  />
                </div>

                <select
                  value={studentAccessStatusFilter}
                  onChange={(e) =>
                    setStudentAccessStatusFilter(
                      e.target.value as 'ALL' | 'HABILITADO' | 'BLOQUEADO' | 'MODULOS_PARCIALES'
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  <option value="ALL">Todos los Estudiantes ({students.length})</option>
                  <option value="HABILITADO">✓ Acceso General Habilitado</option>
                  <option value="BLOQUEADO">🔒 Acceso General Bloqueado</option>
                  <option value="MODULOS_PARCIALES">⚙️ Con Módulos Deshabilitados</option>
                </select>
              </div>
            </div>

            {/* Barra de Selección y Edición Masiva (Acceso General + Módulos M1..M5) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
              {/* Fila 1: Selección de Estudiantes + Acciones de Acceso General */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allFilteredIds = filteredAccessStudents.map((s) => s.id);
                      const allSelected =
                        allFilteredIds.length > 0 &&
                        allFilteredIds.every((id) => selectedAccessStudentIds.includes(id));
                      if (allSelected) {
                        setSelectedAccessStudentIds((prev) =>
                          prev.filter((id) => !allFilteredIds.includes(id))
                        );
                      } else {
                        setSelectedAccessStudentIds((prev) =>
                          Array.from(new Set([...prev, ...allFilteredIds]))
                        );
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 cursor-pointer"
                  >
                    {filteredAccessStudents.length > 0 &&
                    filteredAccessStudents.every((s) => selectedAccessStudentIds.includes(s.id))
                      ? '☐ Deseleccionar Filtrados'
                      : `☑ Seleccionar Todos (${filteredAccessStudents.length})`}
                  </button>

                  {selectedAccessStudentIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedAccessStudentIds([])}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs text-slate-600 cursor-pointer"
                    >
                      Limpiar selección
                    </button>
                  )}

                  <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-950 font-mono text-xs font-bold">
                    {selectedAccessStudentIds.length} seleccionado(s)
                  </span>
                </div>

                {/* Botones Masivos de Acceso General (Seleccionados vs Todos) */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleBulkGeneralAccess(selectedAccessStudentIds, true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                  >
                    ✓ Habilitar Seleccionados ({selectedAccessStudentIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkGeneralAccess(selectedAccessStudentIds, false)}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                  >
                    🔒 Deshabilitar Seleccionados ({selectedAccessStudentIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleBulkGeneralAccess(
                        students.map((s) => s.id),
                        true
                      )
                    }
                    className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold cursor-pointer"
                  >
                    🌐 Habilitar a TODOS ({students.length})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleBulkGeneralAccess(
                        students.map((s) => s.id),
                        false
                      )
                    }
                    className="px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 text-red-900 text-xs font-bold cursor-pointer"
                  >
                    🚫 Deshabilitar a TODOS ({students.length})
                  </button>
                </div>
              </div>

              {/* Fila 2: Selector de Módulos (M1 a M5) para Habilitar / Deshabilitar en Lote */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800 mr-1">
                    Módulos de Retos a aplicar:
                  </span>
                  {OFFICIAL_BADGES.map((b) => {
                    const isChecked = bulkTargetModules.includes(b.modulo);
                    return (
                      <button
                        key={b.modulo}
                        type="button"
                        onClick={() => {
                          setBulkTargetModules((prev) =>
                            prev.includes(b.modulo)
                              ? prev.filter((x) => x !== b.modulo)
                              : ([...prev, b.modulo].sort() as (1 | 2 | 3 | 4 | 5)[])
                          );
                        }}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-sky-600 border-sky-700 text-white'
                            : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <span>{isChecked ? '☑' : '☐'}</span>
                        <span>
                          {b.icono} M{b.modulo}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() =>
                      setBulkTargetModules((prev) =>
                        prev.length === 5 ? [] : [1, 2, 3, 4, 5]
                      )
                    }
                    className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    {bulkTargetModules.length === 5 ? 'Desmarcar M1-M5' : 'Marcar M1-M5'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleBulkModulesForStudents(
                        selectedAccessStudentIds,
                        bulkTargetModules,
                        true
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold cursor-pointer"
                  >
                    ✓ Habilitar Módulos Marcados en Seleccionados ({selectedAccessStudentIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleBulkModulesForStudents(
                        selectedAccessStudentIds,
                        bulkTargetModules,
                        false
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold cursor-pointer"
                  >
                    🔒 Deshabilitar Módulos Marcados en Seleccionados ({selectedAccessStudentIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleBulkModulesForStudents(
                        students.map((s) => s.id),
                        bulkTargetModules,
                        true
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900 text-xs font-bold cursor-pointer"
                  >
                    Habilitar Módulos a TODOS
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleBulkModulesForStudents(
                        students.map((s) => s.id),
                        bulkTargetModules,
                        false
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-bold cursor-pointer"
                  >
                    Deshabilitar Módulos a TODOS
                  </button>
                </div>
              </div>
            </div>

            {/* Tabla Interactiva por Estudiante: Selección + Acceso General + Módulos M1..M5 por Estudiante */}
            <div className="w-full overflow-y-auto overflow-x-hidden max-h-[460px] border border-slate-200 rounded-xl bg-white">
              <table className="w-full table-auto text-left border-collapse text-[11px]">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10">
                  <tr>
                    <th className="py-2 px-2.5 w-9 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredAccessStudents.length > 0 &&
                          filteredAccessStudents.every((s) =>
                            selectedAccessStudentIds.includes(s.id)
                          )
                        }
                        onChange={() => {
                          const allFilteredIds = filteredAccessStudents.map((s) => s.id);
                          const allSelected =
                            allFilteredIds.length > 0 &&
                            allFilteredIds.every((id) => selectedAccessStudentIds.includes(id));
                          if (allSelected) {
                            setSelectedAccessStudentIds((prev) =>
                              prev.filter((id) => !allFilteredIds.includes(id))
                            );
                          } else {
                            setSelectedAccessStudentIds((prev) =>
                              Array.from(new Set([...prev, ...allFilteredIds]))
                            );
                          }
                        }}
                        className="w-4 h-4 accent-slate-900 cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-3 font-bold">Estudiante (ID)</th>
                    <th className="py-2.5 px-3 font-bold text-center">
                      Acceso General a Mini Retos
                    </th>
                    <th className="py-2.5 px-3 font-bold">
                      Módulos de Retos Habilitados / Deshabilitados por Estudiante (Clic para alternar M1 a M5)
                    </th>
                    <th className="py-2.5 px-3 font-bold text-center">Acción Rápida Módulos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAccessStudents.map((st) => {
                    const blockedList = config.estudiantesSinMiniRetos || [];
                    const isGeneralEnabled =
                      config.miniRetosAbiertos !== false && !blockedList.includes(st.id);
                    const isChecked = selectedAccessStudentIds.includes(st.id);
                    const blockedModules = getStudentBlockedModules(st);
                    const activeModulesCount = 5 - blockedModules.length;

                    return (
                      <tr
                        key={st.id}
                        className={`transition-colors ${
                          isChecked
                            ? 'bg-indigo-50/60'
                            : isGeneralEnabled
                            ? 'hover:bg-slate-50'
                            : 'bg-red-50/30 hover:bg-red-50/50'
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedAccessStudentIds((prev) =>
                                prev.includes(st.id)
                                  ? prev.filter((id) => id !== st.id)
                                  : [...prev, st.id]
                              );
                            }}
                            className="w-4 h-4 accent-slate-900 cursor-pointer"
                          />
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{st.nombre}</div>
                          <div className="font-mono text-[11px] text-slate-500">{st.id}</div>
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleBulkGeneralAccess([st.id], !isGeneralEnabled)}
                            className={`px-3 py-1 rounded-lg font-mono text-[11px] font-bold cursor-pointer transition-colors ${
                              isGeneralEnabled
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-red-600 hover:bg-red-700 text-white'
                            }`}
                          >
                            {isGeneralEnabled ? '✓ HABILITADO' : '🔒 DESHABILITADO'}
                          </button>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {OFFICIAL_BADGES.map((b) => {
                              const isModBlocked = blockedModules.includes(b.modulo);
                              const isModActive = isGeneralEnabled && !isModBlocked;
                              return (
                                <button
                                  key={b.modulo}
                                  type="button"
                                  onClick={() => handleToggleStudentRetoModule(st.id, b.modulo)}
                                  title={`${b.tituloPrincipal}: Clic para ${
                                    isModBlocked ? 'Habilitar' : 'Deshabilitar'
                                  } Módulo ${b.modulo}`}
                                  className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                                    !isModBlocked
                                      ? isModActive
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                                        : 'bg-slate-100 border-slate-300 text-slate-600'
                                      : 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100 line-through'
                                  }`}
                                >
                                  <span>{!isModBlocked ? '✓' : '🔒'}</span>
                                  <span>
                                    {b.icono} M{b.modulo}
                                  </span>
                                </button>
                              );
                            })}
                            <span className="text-[11px] font-mono text-slate-500 ml-1">
                              ({activeModulesCount}/5 activos)
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSetAllModulesForSingleStudent(st.id, true)}
                              className="px-2 py-1 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-[10px] font-bold cursor-pointer"
                            >
                              Todos (5/5)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetAllModulesForSingleStudent(st.id, false)}
                              className="px-2 py-1 rounded border border-red-300 bg-red-50 hover:bg-red-100 text-red-900 text-[10px] font-bold cursor-pointer"
                            >
                              Ninguno (0/5)
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <OptionServerSaveBar
              sectionKey="mini_retos_acceso_estudiantes"
              label="Acceso a Mini Retos por Estudiante y Módulos (M1-M5)"
              watchValue={{
                sinMiniRetos: config.estudiantesSinMiniRetos,
                modulosBloqueados: config.estudiantesModulosMiniRetosBloqueados,
                studentMods: students.map((s) => ({
                  id: s.id,
                  m: s.modulosRetosBloqueados
                }))
              }}
            />
          </div>
        </div>
      )}

      {/* ================= SUB-TAB 3: BANCO DOCENTE DE MINI RETOS (CRUD + GENERADOR DESDE 740 PREGUNTAS) ================= */}
      {subTab === 'banco_retos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Formulario CRUD + Generador Automático desde Banco de 740 Preguntas */}
          <form
            onSubmit={handleSaveCustomReto}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3.5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingRetoId ? 'Editar Plantilla de Mini Reto' : 'Crear Nuevo Mini Reto Docente'}
              </h3>
              <button
                type="button"
                onClick={handleAutoDraftFromQuestionBank}
                className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-700" />
                <span>Sortear desde Banco (740)</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Módulo (1 al 5)
                </label>
                <select
                  value={formModulo}
                  onChange={(e) => setFormModulo(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  <option value={1}>Módulo 1: Cartógrafo 🧭</option>
                  <option value={2}>Módulo 2: Psicólogo 🧠</option>
                  <option value={3}>Módulo 3: Sherlock 🕵️‍♂️</option>
                  <option value={4}>Módulo 4: Arquitecto 🎯</option>
                  <option value={5}>Módulo 5: Omnicanal 🚀</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mecánica del Juego (12)
                </label>
                <select
                  value={formMecanicaId}
                  onChange={(e) => setFormMecanicaId(e.target.value as MiniRetoMechanicId)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  {MINI_RETO_MECHANICS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.icono} {m.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Tema Curricular</label>
                <input
                  type="text"
                  required
                  value={formTema}
                  onChange={(e) => setFormTema(e.target.value)}
                  placeholder="Ej: Tema 2.2: Factores Sociales"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Umbral (%)</label>
                <input
                  type="number"
                  min={50}
                  max={95}
                  value={formUmbral}
                  onChange={(e) => setFormUmbral(Number(e.target.value) || 60)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Título del Mini Reto
              </label>
              <input
                type="text"
                required
                value={formTitulo}
                onChange={(e) => setFormTitulo(e.target.value)}
                placeholder="Ej: Adivina Quién Soy: El Ídolo de TikTok"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Narrativa / Acertijo / Caso para el Estudiante
              </label>
              <textarea
                rows={3}
                required
                value={formNarrativa}
                onChange={(e) => setFormNarrativa(e.target.value)}
                placeholder="👤 «No soy de tu familia, de hecho, ni siquiera te conozco...»"
                className="w-full p-2.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pregunta Abierta del Reto
              </label>
              <textarea
                rows={2}
                required
                value={formPregunta}
                onChange={(e) => setFormPregunta(e.target.value)}
                placeholder="¿Cuál es mi nombre técnico y por qué influyo en tus decisiones de compra?"
                className="w-full p-2.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pista Opcional (Sin regalar la respuesta)
              </label>
              <input
                type="text"
                value={formPista}
                onChange={(e) => setFormPista(e.target.value)}
                placeholder="Pista: Soy un tipo específico de Grupo de Referencia al que deseas pertenecer."
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 space-y-2.5">
              <div className="text-[11px] font-bold uppercase text-emerald-900">
                🔒 Campos Internos para Guiar a la IA (Ocultos para el Estudiante)
              </div>

              <div>
                <label className="block text-xs font-bold text-emerald-950 mb-1">
                  1. Respuesta Esperada Ideal (Para el Docente y la IA):
                </label>
                <textarea
                  rows={2}
                  required
                  value={formRespuestaEsperada}
                  onChange={(e) => setFormRespuestaEsperada(e.target.value)}
                  placeholder="Eres un Grupo Aspiracional (o grupo de referencia aspiracional): aquel al que el individuo no pertenece pero desea pertenecer por identificación o prestigio."
                  className="w-full p-2 rounded-lg border border-emerald-300 bg-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-emerald-950 mb-1">
                  2. Criterio de Evaluación para el 60%:
                </label>
                <textarea
                  rows={2}
                  required
                  value={formCriterio60}
                  onChange={(e) => setFormCriterio60(e.target.value)}
                  className="w-full p-2 rounded-lg border border-emerald-300 bg-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-emerald-950 mb-1">
                  Conceptos Clave / Sinónimos Aceptados (Separados por coma):
                </label>
                <input
                  type="text"
                  required
                  value={formConceptosClave}
                  onChange={(e) => setFormConceptosClave(e.target.value)}
                  placeholder="grupo aspiracional, referencia aspiracional, aspirar, imitar, referente"
                  className="w-full px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {editingRetoId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRetoId(null);
                    setFormTitulo('');
                    setFormNarrativa('');
                    setFormPregunta('');
                    setFormPista('');
                    setFormRespuestaEsperada('');
                    setFormConceptosClave('');
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{editingRetoId ? 'Guardar Cambios' : 'Guardar en Banco de Mini Retos'}</span>
              </button>
            </div>
          </form>

          {/* Listado de Plantillas del Banco de Mini Retos */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Plantillas Destacadas en el Banco Docente ({customMiniRetos.length})
                </h3>
                <p className="text-xs text-slate-600">
                  Además de estas plantillas fijas, el sistema genera retos ilimitados en tiempo real usando los <strong>{questions.length} reactivos</strong> del Banco Oficial.
                </p>
              </div>
              <select
                value={crudModuloFilter}
                onChange={(e) =>
                  setCrudModuloFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
                }
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold"
              >
                <option value="ALL">Todos los Módulos (1-5)</option>
                <option value={1}>Módulo 1: Cartógrafo 🧭</option>
                <option value={2}>Módulo 2: Psicólogo 🧠</option>
                <option value={3}>Módulo 3: Sherlock 🕵️‍♂️</option>
                <option value={4}>Módulo 4: Arquitecto 🎯</option>
                <option value={5}>Módulo 5: Omnicanal 🚀</option>
              </select>
            </div>

            <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
              {customMiniRetos
                .filter(
                  (reto) => crudModuloFilter === 'ALL' || Number(reto.modulo) === crudModuloFilter
                )
                .map((reto) => (
                <div
                  key={reto.id}
                  className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono font-bold">
                        Módulo {reto.modulo}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-900 font-semibold">
                        {reto.mecanicaNombre}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono">
                        Umbral: ≥{reto.umbralAprobacionPct}%
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRetoId(reto.id);
                          setFormModulo(reto.modulo);
                          setFormTema(reto.tema);
                          setFormMecanicaId(reto.mecanicaId);
                          setFormTitulo(reto.titulo);
                          setFormNarrativa(reto.narrativa);
                          setFormPregunta(reto.preguntaReto);
                          setFormPista(reto.pistaOpcional);
                          setFormRespuestaEsperada(reto.respuestaEsperada);
                          setFormCriterio60(reto.criterioEvaluacion60);
                          setFormConceptosClave(
                            (Array.isArray(reto.conceptosClave) ? reto.conceptosClave : []).join(', ')
                          );
                          setFormUmbral(reto.umbralAprobacionPct);
                        }}
                        className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-semibold cursor-pointer"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateCustomMiniRetos((prev) => prev.filter((x) => x.id !== reto.id))
                        }
                        className="px-2.5 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold cursor-pointer"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>

                  <div className="font-bold text-slate-900 text-sm">{reto.titulo}</div>
                  <p className="text-slate-700 whitespace-pre-line">{reto.narrativa}</p>
                  <div className="font-semibold text-indigo-950">
                    🎯 Pregunta: {reto.preguntaReto}
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-1 text-emerald-950">
                    <div>
                      <strong>Respuesta Esperada (Oculta):</strong> {reto.respuestaEsperada}
                    </div>
                    <div>
                      <strong>Criterio 60%:</strong> {reto.criterioEvaluacion60}
                    </div>
                    <div className="font-mono text-[11px]">
                      <strong>Palabras Clave / Sinónimos:</strong>{' '}
                      {(Array.isArray(reto.conceptosClave) ? reto.conceptosClave : []).join(', ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <OptionServerSaveBar
              sectionKey="mini_retos_banco_plantillas"
              label="Banco de Plantillas de Mini Retos"
              watchValue={customMiniRetos}
            />
          </div>
        </div>
      )}

      {/* Modal de Ajuste Manual de Veredicto Docente */}
      {overrideModalAttempt && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveManualOverride}
            className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <div className="border-b border-slate-200 pb-3">
              <h4 className="text-base font-bold text-slate-900">
                Ajustar Manualmente Veredicto Semántico
              </h4>
              <p className="text-xs text-slate-600">
                Estudiante: <strong>{overrideModalAttempt.studentName}</strong> · Módulo{' '}
                {overrideModalAttempt.modulo} (Intento #{overrideModalAttempt.intentoNumero})
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-700">Respuesta del estudiante:</div>
              <div className="text-slate-900 italic">
                «{overrideModalAttempt.respuestaEstudiante}»
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Porcentaje Final (%):
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={overridePctInput}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    setOverridePctInput(val);
                    setOverrideApprovedInput(val >= (overrideModalAttempt.umbralAprobacionPct || 60));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Estado de la Insignia:
                </label>
                <select
                  value={overrideApprovedInput ? 'APROBADO' : 'REPROBADO'}
                  onChange={(e) => setOverrideApprovedInput(e.target.value === 'APROBADO')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold"
                >
                  <option value="APROBADO">🏅 APROBADO (Desbloquea Insignia)</option>
                  <option value="REPROBADO">❌ NO SUPERADO</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Observación / Nota del Docente:
              </label>
              <input
                type="text"
                value={overrideNoteInput}
                onChange={(e) => setOverrideNoteInput(e.target.value)}
                placeholder="Ej: Argumentó correctamente con ejemplo local de La Dorada."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOverrideModalAttempt(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Guardar Veredicto Docente
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
