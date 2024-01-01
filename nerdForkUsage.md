# How to use this forked version with embedded nerd web font

This fork has two embedded fonts: Nerd-patched `JetBrains` font, and Chinese font `Sarasa Mono SC`.

Suggested Usage below:

1. Install the stock version of `ttyd` to ensure we have all dependencies
2. Compile this forked version (You don't have to do the yarn part since the `html.h` already has font data)
3. install the compiled app to some location
4. Use the following command to launch ttyd

```
./ttyd -W -t fontSize=16 -t fontFamily="JetBrains, SarasaMono, Serif" -p 8022 /bin/zsh
```

The `-W` flag must be there or you won't be able to operate the terminal.
Such behavior may not be the same with the stock version (e.g. Arch).

The `JetBrains, SarasaNerd, Serif` flag must be like this,
do not ignore the `Serif` flag or each of the displayed character will be 2x wide.
If the characters are still 2x width with the above command,
check whether you are using a mobile browser or not.
The page must be displayed in `Desktop` mode of mobile browsers.

For details (in Chinese)：[https://www.weiran.ink/oss/ttyd-with-nerd-font.html](https://www.weiran.ink/oss/ttyd-with-nerd-font.html)

# 如何使用这个内置 nerd 字体的版本

以下是建议，爱折腾的话随意。

内嵌了带有 Nerd 符号的`JetBrains`字体和原版`Sarasa`字体（更纱黑体）`Mono SC`版本。

1. 安装官方版本，确保依赖都没问题
2. 按官方方法编译，不想换字体的话无需用`yarn`重新生成`html.h`
3. 安装到随意什么地方
4. 使用如下命令启动：

```
./ttyd -W -t fontSize=16 -t fontFamily="JetBrains, SarasaMono, Serif" -p 8022 /bin/zsh
```

`-W` 标志不可省略，否则只读。这个可能与某些发行版的官方仓库版本不同（例如Arch）。

字体命令中的`Serif`不可省略，否则所有字体都将是双倍宽度显示。
如果已经使用了上述选项，但字符显示仍然是双倍宽度，
请关注你是不是正在移动设备浏览器上访问。如果是，尝试将浏览器设置为桌面模式。

详情及作者主页：[https://www.weiran.ink/oss/ttyd-with-nerd-font.html](https://www.weiran.ink/oss/ttyd-with-nerd-font.html)
