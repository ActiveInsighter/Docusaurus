import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type QuestionType =
  | 'single'
  | 'multiple'
  | 'fill'
  | 'judge'
  | 'subjective';

type AnswerVisibilityCommand = {
  visible: boolean;
  revision: number;
};

type AnswerVisibilityContextValue = {
  command: AnswerVisibilityCommand;
  setAllAnswersVisible: (visible: boolean) => void;
  toggleAllAnswers: () => void;
};

type QuestionContextValue = {
  analysisContentId: string;
  analysisExpanded: boolean;
  answerVisible: boolean;
  toggleAnalysis: () => void;
  type: QuestionType;
};

const AnswerVisibilityContext =
  createContext<AnswerVisibilityContextValue | null>(null);
const QuestionContext = createContext<QuestionContextValue | null>(null);

export function AnswerVisibilityProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [command, setCommand] = useState<AnswerVisibilityCommand>({
    visible: false,
    revision: 0,
  });

  const setAllAnswersVisible = useCallback((visible: boolean) => {
    setCommand((current) => ({
      visible,
      revision: current.revision + 1,
    }));
  }, []);

  const toggleAllAnswers = useCallback(() => {
    setCommand((current) => ({
      visible: !current.visible,
      revision: current.revision + 1,
    }));
  }, []);

  const value = useMemo(
    () => ({
      command,
      setAllAnswersVisible,
      toggleAllAnswers,
    }),
    [command, setAllAnswersVisible, toggleAllAnswers],
  );

  return (
    <AnswerVisibilityContext.Provider value={value}>
      {children}
    </AnswerVisibilityContext.Provider>
  );
}

export function useAnswerVisibility(): AnswerVisibilityContextValue {
  const context = useContext(AnswerVisibilityContext);

  if (!context) {
    throw new Error(
      'useAnswerVisibility must be used inside AnswerVisibilityProvider.',
    );
  }

  return context;
}

export function useLocalAnswerVisibility(): {
  answerVisible: boolean;
  toggleAnswer: () => void;
} {
  const {command} = useAnswerVisibility();
  const [localState, setLocalState] = useState(() => ({
    visible: command.visible,
    commandRevision: command.revision,
  }));

  const answerVisible =
    command.revision > localState.commandRevision
      ? command.visible
      : localState.visible;

  const toggleAnswer = useCallback(() => {
    setLocalState({
      visible: !answerVisible,
      commandRevision: command.revision,
    });
  }, [answerVisible, command.revision]);

  return {answerVisible, toggleAnswer};
}

export function QuestionContextProvider({
  analysisContentId,
  analysisExpanded,
  answerVisible,
  children,
  toggleAnalysis,
  type,
}: QuestionContextValue & {children: ReactNode}): ReactNode {
  const value = useMemo(
    () => ({
      analysisContentId,
      analysisExpanded,
      answerVisible,
      toggleAnalysis,
      type,
    }),
    [
      analysisContentId,
      analysisExpanded,
      answerVisible,
      toggleAnalysis,
      type,
    ],
  );

  return (
    <QuestionContext.Provider value={value}>
      {children}
    </QuestionContext.Provider>
  );
}

export function useQuestionContext(componentName: string): QuestionContextValue {
  const context = useContext(QuestionContext);

  if (!context) {
    throw new Error(`${componentName} must be used inside <Question>.`);
  }

  return context;
}
