import {
  Children,
  type CSSProperties,
  isValidElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';

import {
  buildQuestionMarkdown,
  type QuestionCopyText,
  writeClipboardText,
} from './copy';
import {
  QuestionContextProvider,
  type QuestionType,
  useLocalAnswerVisibility,
  useQuestionContext,
} from './context';
import styles from './styles.module.css';

export {AnswerVisibilityProvider, useAnswerVisibility} from './context';
export type {QuestionType} from './context';
export type {QuestionCopyText} from './copy';

const questionTypeLabels: Record<QuestionType, string> = {
  single: '单选题',
  multiple: '多选题',
  fill: '填空题',
  judge: '判断题',
  subjective: '主观题',
};

const difficultyLabels: Record<string, string> = {
  easy: '基础',
  medium: '中等',
  hard: '较难',
};

type QuestionProps = {
  type: QuestionType;
  number?: number | string;
  source?: string;
  year?: number | string;
  score?: number | string;
  difficulty?: 'easy' | 'medium' | 'hard' | string;
  tags?: string[];
  copyText?: QuestionCopyText;
  children: ReactNode;
  className?: string;
  id?: string;
};

type CopyStatus = {
  kind: 'success' | 'error';
  message: string;
} | null;

type IconProps = {
  className?: string;
};

function EyeIcon({className}: IconProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18">
      <path
        d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function EyeOffIcon({className}: IconProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18">
      <path
        d="M3 3 21 21M10.6 6.1A10.7 10.7 0 0 1 12 6c6.1 0 9.5 6 9.5 6a16 16 0 0 1-2.1 2.8M6.3 6.4C3.9 8.1 2.5 12 2.5 12s3.4 6 9.5 6c1.3 0 2.5-.3 3.5-.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyIcon({className}: IconProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18">
      <rect
        x="8"
        y="8"
        width="11"
        height="11"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon({className}: IconProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 20 20"
      width="16"
      height="16">
      <path
        d="m4.5 10.2 3.3 3.3 7.7-7.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AnalysisIcon({className}: IconProps): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18">
      <path
        d="M7 4.5h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatQuestionNumber(number: QuestionProps['number']): string {
  if (number === undefined || number === '') {
    return '题目';
  }

  const value = String(number).trim();
  return /^第.+题$/.test(value) ? value : `第 ${value} 题`;
}

function formatYear(year: QuestionProps['year']): string | undefined {
  if (year === undefined || year === '') {
    return undefined;
  }

  const value = String(year).trim();
  return value.endsWith('年') ? value : `${value} 年`;
}

function formatScore(score: QuestionProps['score']): string | undefined {
  if (score === undefined || score === '') {
    return undefined;
  }

  const value = String(score).trim();
  return /分|point/i.test(value) ? value : `${value} 分`;
}

function formatDifficulty(
  difficulty: QuestionProps['difficulty'],
): string | undefined {
  if (!difficulty) {
    return undefined;
  }

  return difficultyLabels[difficulty] ?? difficulty;
}

export function Question({
  children,
  className,
  copyText,
  difficulty,
  id,
  number,
  score,
  source,
  tags = [],
  type,
  year,
}: QuestionProps): ReactNode {
  const rootRef = useRef<HTMLElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisContentId = useId();
  const {answerVisible, toggleAnswer} = useLocalAnswerVisibility();
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);
  const typeLabel = questionTypeLabels[type];
  const numberLabel = formatQuestionNumber(number);
  const yearValue = formatYear(year);
  const scoreValue = formatScore(score);
  const difficultyValue = formatDifficulty(difficulty);
  const sourceLabel = source ? `来源：${source}` : undefined;
  const yearLabel = yearValue ? `年份：${yearValue}` : undefined;
  const scoreLabel = scoreValue ? `分值：${scoreValue}` : undefined;
  const difficultyLabel = difficultyValue
    ? `难度：${difficultyValue}`
    : undefined;
  const tagsLabel =
    tags.length > 0 ? `知识点：${tags.join('、')}` : undefined;
  const hasAnalysis = Children.toArray(children).some(
    (child) => isValidElement(child) && child.type === QuestionAnalysis,
  );
  const difficultyClass =
    difficulty === 'easy'
      ? styles.difficultyEasy
      : difficulty === 'medium'
        ? styles.difficultyMedium
        : difficulty === 'hard'
          ? styles.difficultyHard
          : styles.difficultyCustom;
  const toggleAnalysis = useCallback(() => {
    setAnalysisExpanded((expanded) => !expanded);
  }, []);

  useEffect(
    () => () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const showCopyStatus = (status: CopyStatus) => {
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }

    setCopyStatus(status);
    copyTimerRef.current = setTimeout(() => setCopyStatus(null), 1800);
  };

  const copyQuestion = async () => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    try {
      await writeClipboardText(
        buildQuestionMarkdown(
          root,
          {answerVisible, analysisExpanded},
          copyText,
        ),
      );
      showCopyStatus({
        kind: 'success',
        message:
          answerVisible && analysisExpanded
            ? '题目与解答已复制'
            : answerVisible
              ? '题目与答案已复制'
              : analysisExpanded
                ? '题目与解析已复制'
                : '题目已复制',
      });
    } catch {
      showCopyStatus({
        kind: 'error',
        message: '复制失败，请检查浏览器权限',
      });
    }
  };

  return (
    <section
      ref={rootRef}
      id={id}
      aria-label={
        number === undefined
          ? typeLabel
          : `${numberLabel}，${typeLabel}`
      }
      className={clsx(styles.question, className)}
      data-question
      data-question-type={type}
      data-question-answer-visible={answerVisible ? 'true' : 'false'}
      data-question-analysis-expanded={
        analysisExpanded ? 'true' : 'false'
      }
      data-question-type-label={typeLabel}
      data-question-number={numberLabel}
      data-question-source={sourceLabel}
      data-question-year={yearLabel}
      data-question-score={scoreLabel}
      data-question-difficulty={difficultyLabel}
      data-question-tags={tagsLabel}>
      <header className={styles.header}>
        <div className={styles.metadata} aria-label="题目信息">
          <span
            className={clsx(styles.chip, styles.typeBadge)}
            data-question-meta="type">
            {typeLabel}
          </span>
          {source && (
            <span
              className={clsx(styles.chip, styles.sourceBadge)}
              data-question-meta="source"
              aria-label={`来源：${source}`}>
              {source}
            </span>
          )}
          {yearValue && (
            <span
              className={clsx(styles.chip, styles.yearBadge)}
              data-question-meta="year"
              aria-label={`年份：${yearValue}`}>
              {yearValue}
            </span>
          )}
          {scoreValue && (
            <span
              className={clsx(styles.chip, styles.scoreBadge)}
              data-question-meta="score"
              aria-label={`分值：${scoreValue}`}>
              {scoreValue}
            </span>
          )}
          {difficultyValue && (
            <span
              className={clsx(
                styles.chip,
                styles.difficultyBadge,
                difficultyClass,
              )}
              data-question-meta="difficulty"
              aria-label={`难度：${difficultyValue}`}>
              {difficultyValue}
            </span>
          )}
          {tags.map((tag) => (
            <span
              key={tag}
              className={clsx(styles.chip, styles.tagBadge)}
              data-question-meta="tag"
              aria-label={`知识点：${tag}`}>
              {tag}
            </span>
          ))}
        </div>

        <div className={styles.actions} data-question-copy-ignore>
          <button
            type="button"
            className={clsx(
              styles.iconButton,
              answerVisible && styles.iconButtonActive,
            )}
            data-question-answer-trigger
            aria-label={answerVisible ? '隐藏答案' : '显示答案'}
            aria-pressed={answerVisible}
            title={answerVisible ? '隐藏答案' : '显示答案'}
            onClick={toggleAnswer}>
            {answerVisible ? (
              <EyeOffIcon className={styles.actionIcon} />
            ) : (
              <EyeIcon className={styles.actionIcon} />
            )}
          </button>

          {hasAnalysis && (
            <button
              type="button"
              className={clsx(
                styles.iconButton,
                analysisExpanded && styles.iconButtonActive,
              )}
              data-question-analysis-trigger
              aria-label={
                analysisExpanded ? '收起详细解答' : '展开详细解答'
              }
              aria-expanded={analysisExpanded}
              aria-controls={analysisContentId}
              title={
                analysisExpanded ? '收起详细解答' : '展开详细解答'
              }
              onClick={toggleAnalysis}>
              <AnalysisIcon className={styles.actionIcon} />
            </button>
          )}

          <button
            type="button"
            className={styles.iconButton}
            data-question-copy-trigger
            aria-label="复制当前可见内容"
            title="复制当前可见内容"
            onClick={() => void copyQuestion()}>
            {copyStatus?.kind === 'success' ? (
              <CheckIcon className={styles.actionIcon} />
            ) : (
              <CopyIcon className={styles.actionIcon} />
            )}
          </button>

          <span
            className={clsx(
              styles.copyStatus,
              copyStatus?.kind === 'error' && styles.copyStatusError,
            )}
            role="status"
            aria-live="polite">
            {copyStatus?.message}
          </span>
        </div>
      </header>

      <QuestionContextProvider
        type={type}
        answerVisible={answerVisible}
        analysisContentId={analysisContentId}
        analysisExpanded={analysisExpanded}
        toggleAnalysis={toggleAnalysis}>
        <div className={styles.body}>{children}</div>
      </QuestionContextProvider>
    </section>
  );
}

type QuestionContentProps = {
  children: ReactNode;
  className?: string;
  copyText?: string;
};

export function QuestionStem({
  children,
  className,
  copyText,
}: QuestionContentProps): ReactNode {
  return (
    <div
      className={clsx(styles.stem, className)}
      data-question-stem
      data-question-copy-text={copyText}>
      {children}
    </div>
  );
}

type QuestionOptionsProps = QuestionContentProps & {
  columns?: 'auto' | 1 | 2 | 4;
};

function measureNaturalOptionWidth(option: HTMLElement): number {
  const clone = option.cloneNode(true) as HTMLElement;
  clone.setAttribute('aria-hidden', 'true');
  clone.querySelectorAll('[id]').forEach((element) => {
    element.removeAttribute('id');
  });
  Object.assign(clone.style, {
    inset: '0 auto auto 0',
    maxWidth: 'none',
    pointerEvents: 'none',
    position: 'absolute',
    visibility: 'hidden',
    width: 'max-content',
    zIndex: '-1',
  });
  option.parentElement?.appendChild(clone);

  try {
    return clone.getBoundingClientRect().width;
  } finally {
    clone.remove();
  }
}

export function QuestionOptions({
  children,
  className,
  columns = 'auto',
  copyText,
}: QuestionOptionsProps): ReactNode {
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionCount = Children.toArray(children).filter(
    (child) =>
      isValidElement<QuestionOptionProps>(child) &&
      child.type === QuestionOption,
  ).length;
  const initialColumns =
    columns === 'auto'
      ? optionCount >= 4
        ? 4
        : optionCount >= 2
          ? 2
          : 1
      : columns;
  const [resolvedColumns, setResolvedColumns] = useState<1 | 2 | 4>(
    initialColumns,
  );

  useLayoutEffect(() => {
    const root = optionsRef.current;
    if (!root) {
      return undefined;
    }

    let disposed = false;
    const updateColumns = () => {
      if (disposed) {
        return;
      }

      const options = Array.from(
        root.querySelectorAll<HTMLElement>(':scope > [data-question-option]'),
      );
      if (options.length === 0) {
        setResolvedColumns(1);
        return;
      }

      const rootWidth = root.getBoundingClientRect().width;
      const rootStyle = getComputedStyle(root);
      const gap = Number.parseFloat(rootStyle.columnGap) || 0;
      const minimumOptionWidth =
        (Number.parseFloat(rootStyle.fontSize) || 16) * 8;
      const widestOption = Math.max(
        minimumOptionWidth,
        ...options.map(measureNaturalOptionWidth),
      );
      const maximumColumns = columns === 'auto' ? 4 : columns;
      const candidates = ([4, 2, 1] as const).filter(
        (candidate) =>
          candidate <= maximumColumns && candidate <= options.length,
      );
      const nextColumns =
        candidates.find(
          (candidate) =>
            widestOption * candidate + gap * (candidate - 1) <= rootWidth,
        ) ?? 1;

      setResolvedColumns((current) =>
        current === nextColumns ? current : nextColumns,
      );
    };

    updateColumns();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateColumns);
    resizeObserver?.observe(root);
    void document.fonts?.ready.then(updateColumns);

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
    };
  }, [children, columns]);

  return (
    <div
      ref={optionsRef}
      className={clsx(
        styles.options,
        resolvedColumns === 2 && styles.optionsTwoColumns,
        resolvedColumns === 4 && styles.optionsFourColumns,
        className,
      )}
      role="list"
      data-question-options
      data-question-options-columns={resolvedColumns}
      data-question-copy-text={copyText}>
      {children}
    </div>
  );
}

type QuestionOptionProps = {
  children: ReactNode;
  correct?: boolean;
  className?: string;
  copyText?: string;
};

export function QuestionOption({
  children,
  className,
  copyText,
  correct = false,
}: QuestionOptionProps): ReactNode {
  const {answerVisible} = useQuestionContext('QuestionOption');
  const showCorrect = answerVisible && correct;

  return (
    <div
      className={clsx(
        styles.option,
        showCorrect && styles.optionCorrect,
        className,
      )}
      role="listitem"
      data-question-option
      data-question-correct={correct ? 'true' : 'false'}
      data-question-correct-visible={showCorrect ? 'true' : 'false'}>
      <div
        className={styles.optionContent}
        data-question-option-content
        data-question-copy-text={copyText}>
        {children}
      </div>
      {showCorrect && (
        <span className={styles.visuallyHidden} data-question-copy-ignore>
          正确选项
        </span>
      )}
    </div>
  );
}

type QuestionBlankProps = {
  answer?: ReactNode;
  children?: ReactNode;
  className?: string;
  copyText?: string;
  placeholder?: string;
  variant?: 'fill' | 'judge';
  width?: number | string;
};

export function QuestionBlank({
  answer,
  children,
  className,
  copyText,
  placeholder = '____',
  variant,
  width,
}: QuestionBlankProps): ReactNode {
  const {answerVisible, type} = useQuestionContext('QuestionBlank');
  const resolvedVariant = variant ?? (type === 'judge' ? 'judge' : 'fill');
  const answerNode = answer ?? children;
  const minWidth =
    typeof width === 'number' ? `${width}ch` : (width ?? undefined);
  const blankStyle = minWidth
    ? ({'--question-blank-min-width': minWidth} as CSSProperties)
    : undefined;
  const copyPlaceholder =
    resolvedVariant === 'judge' ? '（　）' : placeholder;

  return (
    <span
      className={clsx(
        styles.blank,
        resolvedVariant === 'judge' && styles.judgeBlank,
        answerVisible && styles.blankRevealed,
        className,
      )}
      style={blankStyle}
      data-question-blank
      data-question-blank-kind={resolvedVariant}
      data-question-blank-placeholder={copyPlaceholder}>
      {resolvedVariant === 'judge' && (
        <span className={styles.blankBracket} aria-hidden="true">
          （
        </span>
      )}
      <span className={styles.blankLayers}>
        <span
          className={styles.blankPlaceholder}
          aria-hidden={answerVisible}>
          {resolvedVariant === 'judge' ? '\u2003' : placeholder}
        </span>
        <span
          className={styles.blankAnswer}
          data-question-blank-answer
          data-question-copy-text={copyText}
          aria-hidden={!answerVisible}>
          {answerNode}
        </span>
      </span>
      {resolvedVariant === 'judge' && (
        <span className={styles.blankBracket} aria-hidden="true">
          ）
        </span>
      )}
    </span>
  );
}

type QuestionAnswerProps = QuestionContentProps & {
  label?: string;
};

export function QuestionAnswer({
  children,
  className,
  copyText,
  label = '参考答案',
}: QuestionAnswerProps): ReactNode {
  const {answerVisible} = useQuestionContext('QuestionAnswer');

  return (
    <section
      className={clsx(styles.answer, className)}
      data-question-answer
      hidden={!answerVisible}>
      <div className={styles.answerLabel}>{label}</div>
      <div
        className={styles.answerContent}
        data-question-answer-content
        data-question-copy-text={copyText}>
        {children}
      </div>
    </section>
  );
}

export function QuestionAnalysis({
  children,
  className,
  copyText,
}: QuestionContentProps): ReactNode {
  const {analysisContentId, analysisExpanded} = useQuestionContext(
    'QuestionAnalysis',
  );

  return (
    <section
      className={clsx(styles.analysis, className)}
      data-question-analysis
      data-expanded={analysisExpanded ? 'true' : 'false'}
      aria-label="详细解答"
      aria-hidden={!analysisExpanded}
      inert={!analysisExpanded}>
      <div className={styles.analysisMotion}>
        <div className={styles.analysisPanel}>
          <div
            id={analysisContentId}
            className={styles.analysisContent}
            tabIndex={analysisExpanded ? 0 : -1}
            data-question-analysis-content
            data-question-copy-text={copyText}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
