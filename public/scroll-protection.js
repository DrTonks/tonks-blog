/**
 * 强力滚动保护脚本
 * 通过劫持 window.scrollTo 和相关滚动方法来阻止意外的滚动跳转
 * 专门解决 Twikoo 评论系统的滚动问题
 */

(() => {
	// This file is injected again when Swup replaces an article. Never wrap the
	// scrolling APIs or attach the global observers more than once.
	if (window.__tonksScrollProtectionInitialized) return;
	window.__tonksScrollProtectionInitialized = true;

	// 保存原始的滚动方法
	const originalScrollTo = window.scrollTo;
	const originalScrollBy = window.scrollBy;
	const originalScrollIntoView = Element.prototype.scrollIntoView;

	// 滚动保护状态
	const scrollProtection = {
		enabled: false,
		allowedY: null,
		startTime: 0,
		duration: 0,
		timeout: null,
	};
	let isPageTransitioning = false;
	let lastTwikooInteractionAt = 0;

	function disableScrollProtection() {
		scrollProtection.enabled = false;
		if (scrollProtection.timeout) {
			clearTimeout(scrollProtection.timeout);
			scrollProtection.timeout = null;
		}
	}

	// 检测是否为TOC导航触发的滚动
	function checkIsTOCNavigation() {
		// 检查调用堆栈，看是否来自TOC组件
		const stack = new Error().stack;
		if (stack && (stack.includes('handleAnchorClick') || stack.includes('TOC.astro'))) {
			return true;
		}

		// 检查最近是否有TOC点击事件
		if (window.tocClickTimestamp && Date.now() - window.tocClickTimestamp < 1000) {
			return true;
		}

		// 检查是否在TOC元素上
		const activeElement = document.activeElement;
		if (activeElement && activeElement.closest('#toc, .table-of-contents')) {
			return true;
		}

		return false;
	}

	// 启动滚动保护
	function enableScrollProtection(duration = 3000, currentY = null) {
		if (isPageTransitioning) return;
		scrollProtection.enabled = true;
		scrollProtection.allowedY =
			currentY !== null ? currentY : window.scrollY || window.pageYOffset;
		scrollProtection.startTime = Date.now();
		scrollProtection.duration = duration;

		// 清除之前的定时器
		if (scrollProtection.timeout) {
			clearTimeout(scrollProtection.timeout);
		}

		// 设置保护结束时间
		scrollProtection.timeout = setTimeout(() => {
			scrollProtection.enabled = false;
			console.log("[强力滚动保护] 保护期结束");
		}, duration);

		console.log(
			`[强力滚动保护] 启动保护 ${duration}ms，允许Y位置:`,
			scrollProtection.allowedY,
		);
	}

	// 检查滚动是否被允许
	function isScrollAllowed(x, y) {
		if (!scrollProtection.enabled) {
			return true;
		}

		// 检查是否是TOC或MD导航触发的滚动
		const isTOCNavigation = checkIsTOCNavigation();
		if (isTOCNavigation) {
			console.log('[强力滚动保护] 检测到TOC导航，允许滚动');
			return true;
		}

		// 允许小幅度的滚动调整（±50像素）
		const tolerance = 50;
		const allowedY = scrollProtection.allowedY;

		if (Math.abs(y - allowedY) <= tolerance) {
			return true;
		}

		// 如果尝试滚动到顶部（y < 100）而当前位置在更下方，阻止
		if (y < 100 && allowedY > 100) {
			console.log(
				"[强力滚动保护] 阻止滚动到顶部，目标Y:",
				y,
				"允许Y:",
				allowedY,
			);
			return false;
		}

		return true;
	}

	// 劫持 window.scrollTo
	window.scrollTo = (x, y) => {
		const originalArgs = [x, y];
		// 处理参数为对象的情况
		if (typeof x === "object") {
			const options = x;
			x = options.left || 0;
			y = options.top || 0;
		}

		if (isScrollAllowed(x, y)) {
			// 保留 ScrollToOptions（尤其是 behavior），不要把平滑滚动降级成瞬移。
			if (typeof originalArgs[0] === "object") {
				originalScrollTo.call(window, originalArgs[0]);
			} else {
				originalScrollTo.call(window, x, y);
			}
		} else {
			console.log("[强力滚动保护] 阻止 scrollTo:", x, y);
			// 忽略这次程序化滚动即可。强制写回旧位置会与 Swup 的滚动
			// 恢复互相争抢，在新页面高度变化时形成上下抽搐。
		}
	};

	// 劫持 window.scrollBy
	window.scrollBy = (x, y) => {
		const originalArgs = [x, y];
		if (typeof x === "object") {
			const options = x;
			x = options.left || 0;
			y = options.top || 0;
		}
		const currentY = window.scrollY || window.pageYOffset;
		const targetY = currentY + (y || 0);

		if (isScrollAllowed(x, targetY)) {
			if (typeof originalArgs[0] === "object") {
				originalScrollBy.call(window, originalArgs[0]);
			} else {
				originalScrollBy.call(window, x, y);
			}
		} else {
			console.log("[强力滚动保护] 阻止 scrollBy:", x, y);
		}
	};

	// 劫持 Element.scrollIntoView
	Element.prototype.scrollIntoView = function (options) {
		if (!scrollProtection.enabled) {
			originalScrollIntoView.call(this, options);
			return;
		}

		// 在保护期内，尝试阻止 scrollIntoView
		const rect = this.getBoundingClientRect();
		const currentY = window.scrollY || window.pageYOffset;
		const targetY = currentY + rect.top;

		if (isScrollAllowed(0, targetY)) {
			originalScrollIntoView.call(this, options);
		} else {
			console.log("[强力滚动保护] 阻止 scrollIntoView");
		}
	};

	// 监听 Twikoo 相关的交互事件
	document.addEventListener(
		"click",
		(event) => {
			const target = event.target;

			// 检查是否点击了TOC导航
			if (target.closest('#toc, .table-of-contents') && target.closest('a[href^="#"]')) {
				window.tocClickTimestamp = Date.now();
				console.log('[强力滚动保护] 检测到TOC导航点击');
				return; // 不启动保护，允许TOC正常工作
			}

			// 检查是否点击了 Twikoo 相关元素
			if (
				target.closest("#tcomment") ||
				target.matches(
					".tk-action-icon, .tk-submit, .tk-cancel, .tk-preview, .tk-owo, .tk-admin, .tk-edit, .tk-delete, .tk-reply, .tk-expand",
				) ||
				target.closest(
					".tk-action-icon, .tk-submit, .tk-cancel, .tk-preview, .tk-owo, .tk-admin, .tk-edit, .tk-delete, .tk-reply, .tk-expand",
				)
			) {
				lastTwikooInteractionAt = Date.now();
				// 立即启动保护
				enableScrollProtection(4000); // 增加保护时间到4秒
				console.log("[强力滚动保护] 检测到 Twikoo 交互，启动保护");
			}

			// 特别检查管理面板相关操作（包括关闭操作）
			if (
				target.matches(
					".tk-admin-panel, .tk-admin-overlay, .tk-modal, .tk-dialog, .tk-admin-close, .tk-close",
				) ||
				target.closest(
					".tk-admin-panel, .tk-admin-overlay, .tk-modal, .tk-dialog, .tk-admin-close, .tk-close",
				) ||
				target.classList.contains("tk-admin") ||
				target.closest(".tk-admin")
			) {
				lastTwikooInteractionAt = Date.now();
				enableScrollProtection(6000); // 管理面板操作保护更长时间
				console.log("[强力滚动保护] 检测到 Twikoo 管理面板操作，启动长期保护");
			}

			// 检查是否点击了遮罩层（通常用于关闭模态框）
			if (
				target.classList.contains("tk-overlay") ||
				target.classList.contains("tk-mask") ||
				target.matches('[class*="overlay"]') ||
				target.matches('[class*="mask"]') ||
				target.matches('[class*="backdrop"]')
			) {
				// 检查是否在 Twikoo 区域内
				const tcommentEl = document.querySelector("#tcomment");
				if (
					tcommentEl &&
					(target.closest("#tcomment") || tcommentEl.contains(target))
				) {
					enableScrollProtection(4000);
					console.log("[强力滚动保护] 检测到 Twikoo 遮罩层点击，启动保护");
				}
			}
		},
		true,
	); // 使用捕获阶段

	// 监听表单提交
	document.addEventListener(
		"submit",
		(event) => {
			if (event.target.closest("#tcomment")) {
				lastTwikooInteractionAt = Date.now();
				enableScrollProtection(4000);
				console.log("[强力滚动保护] 检测到 Twikoo 表单提交，启动保护");
			}
		},
		true,
	);

	// 监听键盘事件（特别是 ESC 键，用于关闭管理面板）
	document.addEventListener(
		"keydown",
		(event) => {
			if (event.key === "Escape" || event.keyCode === 27) {
				// 检查是否在 Twikoo 区域内有活动的管理面板
				const tcommentEl = document.querySelector("#tcomment");
				if (tcommentEl) {
					// 检查是否有可见的管理面板或模态框
					const adminPanel = tcommentEl.querySelector(
						".tk-admin-panel, .tk-modal, .tk-dialog, [class*='admin'], [class*='modal']",
					);
					if (adminPanel && adminPanel.offsetParent !== null) {
						lastTwikooInteractionAt = Date.now();
						// 面板可见，启动保护
						enableScrollProtection(3000);
						console.log(
							"[强力滚动保护] 检测到 ESC 键关闭 Twikoo 管理面板，启动保护",
						);
					}
				}
			}
		},
		true,
	);

	// 监听 DOM 变化，检测管理面板的关闭
	const observer = new MutationObserver((mutations) => {
		// Twikoo's initial render and Swup's removal are not user actions. Only
		// protect mutations shortly after an actual interaction with the widget.
		if (isPageTransitioning || Date.now() - lastTwikooInteractionAt > 1500) return;
		mutations.forEach((mutation) => {
			if (mutation.type === "childList" || mutation.type === "attributes") {
				const target = mutation.target;

				// 检查是否是 Twikoo 相关的 DOM 变化
				if (target.closest && target.closest("#tcomment")) {
					// 检查是否有元素被移除或隐藏（可能是面板关闭）
					if (
						mutation.removedNodes.length > 0 ||
						(mutation.type === "attributes" &&
							mutation.attributeName === "style")
					) {
						enableScrollProtection(2000);
						console.log(
							"[强力滚动保护] 检测到 Twikoo DOM 变化（可能是面板关闭），启动保护",
						);
					}
				}
			}
		});
	});

	// Scroll restoration owns the viewport throughout a route change. Release
	// any old Twikoo lock before Swup starts and keep protection inactive until
	// the new page has settled.
	document.addEventListener("astro:before-swap", () => {
		isPageTransitioning = true;
		disableScrollProtection();
	});
	document.addEventListener("astro:page-load", () => {
		disableScrollProtection();
		requestAnimationFrame(() => {
			isPageTransitioning = false;
		});
	});

	// 开始监听 DOM 变化
	if (document.body) {
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["style", "class"],
		});
	} else {
		document.addEventListener("DOMContentLoaded", () => {
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["style", "class"],
			});
		});
	}

	// 提供全局接口
	window.scrollProtectionManager = {
		enable: enableScrollProtection,
		disable: disableScrollProtection,
		setPageTransitioning: (value) => {
			isPageTransitioning = value;
			if (value) disableScrollProtection();
		},
		isEnabled: () => scrollProtection.enabled,
		getStatus: () => ({ ...scrollProtection }),
		// 新增：强制保护模式（用于调试）
		forceProtect: (duration = 10000) => {
			enableScrollProtection(duration);
			console.log(`[强力滚动保护] 强制保护模式启动 ${duration}ms`);
		},
		// 新增：获取当前滚动位置
		getCurrentScroll: () => {
			return {
				x: window.scrollX || window.pageXOffset,
				y: window.scrollY || window.pageYOffset,
			};
		},
		// 新增：检测 Twikoo 状态
		checkTwikooStatus: () => {
			const tcomment = document.querySelector("#tcomment");
			if (!tcomment) return { exists: false };

			const adminPanels = tcomment.querySelectorAll(
				".tk-admin-panel, .tk-modal, .tk-dialog, [class*='admin'], [class*='modal']",
			);
			const visiblePanels = Array.from(adminPanels).filter(
				(panel) => panel.offsetParent !== null,
			);

			return {
				exists: true,
				adminPanelsCount: adminPanels.length,
				visiblePanelsCount: visiblePanels.length,
				hasVisiblePanels: visiblePanels.length > 0,
			};
		},
	};

	console.log("[强力滚动保护] 初始化完成");
})();
