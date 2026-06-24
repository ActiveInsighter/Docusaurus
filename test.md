请你认真阅读我上传的考研真题pdf，用视觉能力识别。按照合适的结构整理输出为md，不要遗漏省略内容。

格式：一级标题写线代分类真题这种，二级标题写模块，三级标题写每个模块的小节，比如：
# 线代分类真题
## 模块一 行列式
### 一、低阶数值型行列式的计算
1. 【1988-45-1分】
$$\begin{vmatrix}1 & 1 & 1 & 0 \\ 1 & 1 & 0 & 1 \\ 1 & 0 & 1 & 1 \\ 0 & 1 & 1 & 1\end{vmatrix}=$$

题目要有合适的间距，小题紧凑一些，大题间距大一些，方便我在平板上写


1. 公式要求
   - 所有公式必须使用美元符号格式，方便 Obsidian 渲染。
   - 注意公式不要出错，要支持Obsidian 默认引擎渲染
   - 行内公式使用：$a^2+b^2=c^2$
   - 块级公式使用：
     $$
     E=mc^2
     $$
   - 多行公式使用：
     $$
     \begin{aligned}
     a^2+b^2 &= c^2 \\
     x &= \frac{-b\pm\sqrt{b^2-4ac}}{2a}
     \end{aligned}
     $$
   - 不要使用 \( \) 或 \[ \] 格式。
过长的公式要换行，比如：
$$
\begin{aligned}
f(x,y)
&= \frac{1}{2\pi\sigma_1\sigma_2\sqrt{1-\rho^2}} \\
&\quad \times
\exp\biggl\{
-\frac{1}{2(1-\rho^2)}
\biggl[
\left(\frac{x-\mu_1}{\sigma_1}\right)^2 \\
&\qquad
-2\rho
\left(\frac{x-\mu_1}{\sigma_1}\right)
\left(\frac{y-\mu_2}{\sigma_2}\right)
+
\left(\frac{y-\mu_2}{\sigma_2}\right)^2
\biggr]
\biggr\}.
\end{aligned}
$$

但是一般的不要换，除非特别长，一行显示不下
2. 选择题排版要求
   - 选择题题干要清晰。
   - 选项根据长度灵活排版：
     - 选项较短时，可以一行写多个。
     - 选项中等时，可以两行排版。
     - 选项较长时，每个选项单独一行。
    例如：
    $$(A) \alpha_1,\alpha_2,\alpha_3\quad(B) \alpha_1,\alpha_2,\alpha_4\quad(C) \alpha_1,\alpha_2,\alpha_5\quad(D) \alpha_1,\alpha_2,\alpha_3,\alpha_5$$
    
3. 按小节编好序号，带上标签【1988-45-1分】，题目写在标签下一行


4. 输出要求
   - 最终只输出完整的 Markdown 文件内容。
   - 不要直接输出。写成文件给我链接
 




 请你认真阅读我上传的考研真题pdf，用视觉能力识别。按照合适的结构整理输出为md，不要遗漏省略内容。

 格式:每一本书用一级标题，章节用二级标题，小节用三级标题，题目用列表，每个小节独立编号，考察年份标签保留。
 小题后面用三个<br>换行符留空，大题用六个。
 可采用各种md格式写，比如有的表格你就用表格写，代码块就用代码块格式写。

 
1. 公式要求
   - 所有公式必须使用美元符号格式，方便 Obsidian 渲染。
   - 注意公式不要出错，要支持Obsidian 默认引擎渲染
   - 行内公式使用：$a^2+b^2=c^2$
   - 块级公式使用：
     $$
     E=mc^2
     $$
   - 多行公式使用：
     $$
     \begin{aligned}
     a^2+b^2 &= c^2 \\
     x &= \frac{-b\pm\sqrt{b^2-4ac}}{2a}
     \end{aligned}
     $$
   - 不要使用 \( \) 或 \[ \] 格式。
过长的公式要换行，比如：
$$
\begin{aligned}
f(x,y)
&= \frac{1}{2\pi\sigma_1\sigma_2\sqrt{1-\rho^2}} \\
&\quad \times
\exp\biggl\{
-\frac{1}{2(1-\rho^2)}
\biggl[
\left(\frac{x-\mu_1}{\sigma_1}\right)^2 \\
&\qquad
-2\rho
\left(\frac{x-\mu_1}{\sigma_1}\right)
\left(\frac{y-\mu_2}{\sigma_2}\right)
+
\left(\frac{y-\mu_2}{\sigma_2}\right)^2
\biggr]
\biggr\}.
\end{aligned}
$$

但是一般的不要换，除非特别长，一行显示不下
2. 选择题排版要求
   - 选择题题干要清晰。
   - 选项根据长度灵活排版：
     - 选项较短时，可以一行写多个。
     - 选项中等时，可以两行排版。
     - 选项较长时，每个选项单独一行。
    例如：
    $$(A) \alpha_1,\alpha_2,\alpha_3\quad(B) \alpha_1,\alpha_2,\alpha_4\quad(C) \alpha_1,\alpha_2,\alpha_5\quad(D) \alpha_1,\alpha_2,\alpha_3,\alpha_5$$

3. 复杂的图片你不用画，做<img>+描述的标记，方便查找位置，后面我会画png图
4. 输出要求
   - 最终只输出完整的 Markdown 文件内容。
   - 不要直接输出。写成文件给我链接

有很多问题，首先是有很多莫名其妙的换行，比如：
【2010】设将$n(n>1)$ 个整数存放到一维数组R 中。试设计一个在时间和空间两方面都尽可能高
   效的算法。将R 中保存的序列循环左移$p(0<p<n)$ 个位置, 即将R 中的数据由X0,$X_1$,⋯,$X_{n-1}$ 变
   换为Xp,$X_p$+1,⋯$X_{n-1}$,$X_0$,$X_1$,⋯,$X_p$-1 。要求:
修改一下
还有的表格没有渲染出来，比如：

   | 地址  | 元素 | 链接地址 |
   | ----- | ---- | -------- |
   | 1000H | a    | 1010H    |
   | 1004H | b    | 100CH    |
   | 1008H | c    | 1000H    |
   | 100CH | d    | NULL     |
   | 1010H | e    | 1004H    |
   | 1014H |      |          |

同一行的选项之间要有空隙，比如：
A. dcebfa &emsp;&emsp; B. cbdaef 
然后很多长的选项单独写一行，这个问题很多，你改一下

然后你再看看有没有其他的格式或内容错误问题，一并修改

