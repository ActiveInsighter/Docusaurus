import MDXComponents from '@theme-original/MDXComponents';
import {
  Question,
  QuestionAnalysis,
  QuestionAnswer,
  QuestionBlank,
  QuestionOption,
  QuestionOptions,
  QuestionStem,
} from '@site/src/components/Question';
import type {MDXComponentsObject} from '@theme/MDXComponents';

const components: MDXComponentsObject = {
  ...MDXComponents,
  Question,
  QuestionStem,
  QuestionOptions,
  QuestionOption,
  QuestionBlank,
  QuestionAnswer,
  QuestionAnalysis,
};

export default components;
