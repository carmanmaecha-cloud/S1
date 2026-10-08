import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ExamModality } from '../types';

export type ActiveAppRoleView = 'estudiante' | 'docente';
export type StudentDashboardTabType =
  | 'modalidades'
  | 'mis_notas'
  | 'diagnostico_pedagogico'
  | 'mini_retos';

export type TeacherTabType =
  | 'monitor_vivo'
  | 'estudiantes'
  | 'calificaciones'
  | 'estadisticas_grupo'
  | 'mini_retos'
  | 'consolidado_abpro'
  | 'diagnostico'
  | 'banco_preguntas'
  | 'integraciones'
  | 'seguridad_correo';

export interface PersistedAuthSessionState {
  activeView: ActiveAppRoleView;
  studentSessionActive: boolean;
  verifiedStudentId: string | null;
  studentDashboardTab: StudentDashboardTabType;
  selectedModality: ExamModality;
  studentExamPhase: 'login' | 'modality_select' | 'active_exam' | 'results';
  teacherSessionActive: boolean;
  teacherAuthenticatedId: string | null;
  teacherActiveTab: TeacherTabType;
  lastActivityIso: string;
}

const AUTH_SESSION_STORAGE_KEY = 'evaluaplus_global_auth_session_v1';

const DEFAULT_AUTH_STATE: PersistedAuthSessionState = {
  activeView: 'estudiante',
  studentSessionActive: false,
  verifiedStudentId: null,
  studentDashboardTab: 'modalidades',
  selectedModality: 'integral',
  studentExamPhase: 'login',
  teacherSessionActive: false,
  teacherAuthenticatedId: null,
  teacherActiveTab: 'estudiantes',
  lastActivityIso: new Date().toISOString()
};

/**
 * Wrapper around sessionStorage + localStorage to ensure user sessions
 * persist reliably across page reloads (F5), URL navigations, and iframe reloads
 * until the user explicitly logs out.
 */
export const sessionStorageWrapper = {
  read(): PersistedAuthSessionState {
    try {
      const fromSession = sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      if (fromSession) {
        const parsed = JSON.parse(fromSession);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_AUTH_STATE, ...parsed };
        }
      }
    } catch {
      // ignore sessionStorage read errors
    }

    try {
      const fromLocal = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      if (fromLocal) {
        const parsed = JSON.parse(fromLocal);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_AUTH_STATE, ...parsed };
        }
      }
    } catch {
      // ignore localStorage read errors
    }

    return DEFAULT_AUTH_STATE;
  },

  write(state: PersistedAuthSessionState): void {
    const serialized = JSON.stringify({
      ...state,
      lastActivityIso: new Date().toISOString()
    });
    try {
      sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, serialized);
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(AUTH_SESSION_STORAGE_KEY, serialized);
    } catch {
      // ignore
    }
  },

  clear(): void {
    try {
      sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
};

interface AuthContextValue {
  authState: PersistedAuthSessionState;
  setActiveView: (view: ActiveAppRoleView) => void;
  loginStudent: (studentId: string) => void;
  logoutStudent: () => void;
  setStudentDashboardTab: (tab: StudentDashboardTabType) => void;
  setSelectedModality: (modality: ExamModality) => void;
  setStudentExamPhase: (phase: 'login' | 'modality_select' | 'active_exam' | 'results') => void;
  loginTeacher: (teacherId: string) => void;
  logoutTeacher: () => void;
  setTeacherActiveTab: (tab: TeacherTabType) => void;
  logoutAll: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<PersistedAuthSessionState>(() => {
    const loaded = sessionStorageWrapper.read();
    // Ensure consistent view with active session on page reload
    if (loaded.teacherSessionActive) {
      return { ...loaded, activeView: 'docente' };
    }
    if (loaded.studentSessionActive && loaded.verifiedStudentId) {
      return {
        ...loaded,
        activeView: 'estudiante',
        studentExamPhase:
          loaded.studentExamPhase === 'login' ? 'modality_select' : loaded.studentExamPhase
      };
    }
    return loaded;
  });

  useEffect(() => {
    sessionStorageWrapper.write(authState);
  }, [authState]);

  const setActiveView = useCallback((view: ActiveAppRoleView) => {
    setAuthState((prev) => {
      const next = { ...prev, activeView: view };
      sessionStorageWrapper.write(next);
      return next;
    });
  }, []);

  const loginStudent = useCallback((studentId: string) => {
    setAuthState((prev) => {
      const next: PersistedAuthSessionState = {
        ...prev,
        activeView: 'estudiante',
        studentSessionActive: true,
        verifiedStudentId: studentId,
        studentExamPhase: 'modality_select',
        teacherSessionActive: false,
        teacherAuthenticatedId: null,
        lastActivityIso: new Date().toISOString()
      };
      sessionStorageWrapper.write(next);
      return next;
    });
  }, []);

  const logoutStudent = useCallback(() => {
    setAuthState((prev) => {
      const next: PersistedAuthSessionState = {
        ...prev,
        studentSessionActive: false,
        verifiedStudentId: null,
        studentExamPhase: 'login',
        lastActivityIso: new Date().toISOString()
      };
      sessionStorageWrapper.write(next);
      return next;
    });
  }, []);

  const setStudentDashboardTab = useCallback((tab: StudentDashboardTabType) => {
    setAuthState((prev) => {
      const next = { ...prev, studentDashboardTab: tab };
      sessionStorageWrapper.write(next);
      return next;
    });
  }, []);

  const setSelectedModality = useCallback((modality: ExamModality) => {
    setAuthState((prev) => {
      const next = { ...prev, selectedModality: modality };
      sessionStorageWrapper.write(next);
      return next;
    });
  }, []);

  const setStudentExamPhase = useCallback(
    (phase: 'login' | 'modality_select' | 'active_exam' | 'results') => {
      setAuthState((prev) => {
        const next = {
          ...prev,
          studentExamPhase: phase,
          studentSessionActive: phase !== 'login' && Boolean(prev.verifiedStudentId)
        };
        sessionStorageWrapper.write(next);
        return next;
      });
    },
    []
  );

  const loginTeacher = useCallback((teacherId: string) => {
    setAuthState((prev) => {
      const next: PersistedAuthSessionState = {
        ...prev,
        activeView: 'docente',
        teacherSessionActive: true,
        teacherAuthenticatedId: teacherId,
        studentSessionActive: false,
        verifiedStudentId: null,
        studentExamPhase: 'login',
        lastActivityIso: new Date().toISOString()
      };
      sessionStorageWrapper.write(next);
      return next;
    });
  }, []);

  const logoutTeacher = useCallback(() => {
    setAuthState((prev) => {
      const next: PersistedAuthSessionState = {
        ...prev,
        teacherSessionActive: false,
        teacherAuthenticatedId: null,
        lastActivityIso: new Date().toISOString()
      };
      sessionStorageWrapper.write(next);
      return next;
    });
  }, []);

  const setTeacherActiveTab = useCallback((tab: TeacherTabType) => {
    setAuthState((prev) => {
      const next = { ...prev, teacherActiveTab: tab };
      sessionStorageWrapper.write(next);
      return next;
    });
  }, []);

  const logoutAll = useCallback(() => {
    sessionStorageWrapper.clear();
    setAuthState((prev) => ({
      ...DEFAULT_AUTH_STATE,
      activeView: prev.activeView
    }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authState,
        setActiveView,
        loginStudent,
        logoutStudent,
        setStudentDashboardTab,
        setSelectedModality,
        setStudentExamPhase,
        loginTeacher,
        logoutTeacher,
        setTeacherActiveTab,
        logoutAll
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthSession() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthSession must be used within an AuthProvider');
  }
  return ctx;
}
