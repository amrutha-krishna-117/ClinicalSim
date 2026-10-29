export type UserRole = 'STUDENT' | 'FACULTY' | 'ADMIN';
export type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type SessionStatus = 'CREATED' | 'HISTORY_TAKING' | 'EXAMINATION' | 'INVESTIGATION' | 'REASONING' | 'DIAGNOSIS' | 'ASSESSMENT' | 'COMPLETED';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface Scenario {
  id: string;
  title: string;
  specialty: string;
  difficulty: Difficulty;
  description: string;
  estimated_duration: number;
  learning_objectives: string[];
  patient_age: number;
  patient_sex: string;
  patient_position: string;
  chief_complaint: string;
  diagnosis?: string;
  is_published: boolean;
}

export interface ScenarioDetail extends Scenario {
  history_data: Record<string, unknown>;
  vital_signs: Record<string, unknown>;
  examination_findings: Record<string, unknown>;
  investigations: Record<string, unknown>;
  differential_diagnoses: string[];
  assessment_rubric: Record<string, unknown>;
}

export interface SimulationSession {
  id: string;
  user_id: string;
  scenario_id: string;
  status: SessionStatus;
  started_at: string;
  completed_at: string | null;
  history_obtained: Record<string, string>;
  examinations_performed: Array<{region: string; method: string; key: string}>;
  findings_revealed: Array<{region: string; method: string; finding: string; is_abnormal: boolean}>;
  investigations_ordered: string[];
  student_diagnosis: string | null;
  student_differentials: string[];
  total_score: number | null;
  score_breakdown: Record<string, number>;
}

export interface Message {
  id: string;
  role: 'student' | 'patient';
  content: string;
  stage: string;
  created_at: string;
}

export interface ExaminationFinding {
  finding: string;
  description: string;
  is_abnormal: boolean;
  clinical_significance: string;
  recorded: boolean;
}

export interface Assessment {
  session_id: string;
  total_score: number;
  score_breakdown: Record<string, number>;
  ai_feedback: string;
  debriefing: {
    what_went_well: string[];
    areas_to_improve: string[];
    missed_findings: string[];
    reasoning_errors: string[];
    learning_points: string[];
    reflection_questions: string[];
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}
