(function () {
	// ---------- Constants ----------
	const REAL_MS_PER_GAME_MINUTE = 2000; // 2s = 1 in-game minute
	const MINUTES_PER_DAY = 24 * 60; // 1440
	const WORK_INCOME_PER_DAY = 100; // ₪100 per day when working full "day"
	// We pro-rate income per minute of active work time across a full 24h day
	const INCOME_PER_MINUTE = WORK_INCOME_PER_DAY / MINUTES_PER_DAY; // ~0.0694 ₪/min

	// Kindergarten times (game clock, 24h)
	const KINDERGARTEN_DROP_START = toMinutes(7, 0); // 07:00
	const KINDERGARTEN_DROP_END = toMinutes(9, 0); // 09:00
	const KINDERGARTEN_PICKUP_TIME = toMinutes(14, 0); // 14:00 exact or a small window
	const KINDERGARTEN_PICKUP_WINDOW = 60; // minutes after 14:00 allowed without "missed"

	// ---------- State ----------
	const state = {
		dayNumber: 1,
		minuteOfDay: toMinutes(7, 0), // Start at 07:00
		money: 0,
		isWorking: false,
		childrenAtKindergarten: false,
		kidsDroppedToday: false,
		kidsPickedToday: false,
		missedPickupToday: false,
		inventory: {}, // { itemId: quantity }
		shopItems: [
			{ id: "food", name: "אוכל", price: 20 },
			{ id: "candy", name: "ממתקים", price: 10 },
			{ id: "clothes", name: "בגדים", price: 60 },
			{ id: "doll", name: "בובה", price: 35 },
			{ id: "toy", name: "צעצוע", price: 45 }
		],
	};

	// ---------- Utilities ----------
	function toMinutes(hours, minutes) {
		return hours * 60 + minutes;
	}

	function formatClock(min) {
		const h = Math.floor(min / 60) % 24;
		const m = min % 60;
		return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
	}

	function isDaytime(min) {
		// Theme by real clock hours:
		// 05:00–16:59 → Day
		// 17:00–18:59 → Sunset (treated as day theme for simplicity)
		// 19:00–04:59 → Night
		const hour = Math.floor(min / 60) % 24;
		return !(hour >= 19 || hour < 5);
	}

	function addInventory(itemId, qty = 1) {
		state.inventory[itemId] = (state.inventory[itemId] || 0) + qty;
	}

	function canDropKids(min) {
		return (
			min >= KINDERGARTEN_DROP_START &&
			min <= KINDERGARTEN_DROP_END &&
			!state.childrenAtKindergarten &&
			!state.kidsDroppedToday
		);
	}

	function canPickupKids(min) {
		const withinWindow =
			min >= KINDERGARTEN_PICKUP_TIME &&
			min <= KINDERGARTEN_PICKUP_TIME + KINDERGARTEN_PICKUP_WINDOW;
		return (
			withinWindow && state.childrenAtKindergarten && !state.kidsPickedToday
		);
	}

	function resetDailyTasks() {
		state.kidsDroppedToday = false;
		state.kidsPickedToday = false;
		state.childrenAtKindergarten = false;
		state.missedPickupToday = false;
	}

	// ---------- DOM ----------
	const el = {
		dayNumber: document.getElementById("day-number"),
		clock: document.getElementById("clock"),
		money: document.getElementById("money"),
		status: document.getElementById("status"),
		workToggle: document.getElementById("work-toggle"),
		dropKids: document.getElementById("drop-kids"),
		pickupKids: document.getElementById("pickup-kids"),
		shopItems: document.getElementById("shop-items"),
		tasksList: document.getElementById("tasks-list"),
		inventoryList: document.getElementById("inventory-list"),
		body: document.body,
	};

	// ---------- Render ----------
	function renderHud() {
		el.dayNumber.textContent = String(state.dayNumber);
		el.clock.textContent = formatClock(state.minuteOfDay);
		el.money.textContent = `₪${Math.floor(state.money)}`;
		el.status.textContent = state.isWorking ? "בעבודה" : "בבית";
		el.workToggle.textContent = state.isWorking ? "הפסק לעבוד" : "התחל לעבוד";

		updateTheme();
	}

	function updateTheme() {
		const dayTheme = isDaytime(state.minuteOfDay);
		if (dayTheme) {
			el.body.classList.remove("night");
		} else {
			el.body.classList.add("night");
		}
	}

	function renderShop() {
		el.shopItems.innerHTML = "";
		state.shopItems.forEach((item) => {
			const card = document.createElement("div");
			card.className = "shop-card";
			card.innerHTML = `
				<h4>${item.name}</h4>
				<div class="price">₪${item.price}</div>
				<button data-id="${item.id}">קנה</button>
			`;
			const btn = card.querySelector("button");
			btn.addEventListener("click", () => purchaseItem(item));
			el.shopItems.appendChild(card);
		});
	}

	function renderInventory() {
		el.inventoryList.innerHTML = "";
		const entries = Object.entries(state.inventory);
		if (entries.length === 0) {
			const li = document.createElement("li");
			li.textContent = "— אין פריטים —";
			el.inventoryList.appendChild(li);
			return;
		}
		for (const [itemId, qty] of entries) {
			const item = state.shopItems.find((i) => i.id === itemId);
			const li = document.createElement("li");
			li.textContent = `${item ? item.name : itemId}: ${qty}`;
			el.inventoryList.appendChild(li);
		}
	}

	function renderTasks() {
		el.tasksList.innerHTML = "";

		const tasks = [
			{
				label: `הורדת הילדים לגן (בין ${formatClock(KINDERGARTEN_DROP_START)} ל-${formatClock(
					KINDERGARTEN_DROP_END
				)})`,
				state: state.kidsDroppedToday
					? "done"
					: canDropKids(state.minuteOfDay)
					? "pending"
					: "pending",
			},
			{
				label: `איסוף הילדים ב-${formatClock(KINDERGARTEN_PICKUP_TIME)} (עד ${formatClock(
					KINDERGARTEN_PICKUP_TIME + KINDERGARTEN_PICKUP_WINDOW
				)})`,
				state: state.kidsPickedToday
					? "done"
					: state.missedPickupToday
					? "missed"
					: state.childrenAtKindergarten
					? "pending"
					: "pending",
			},
		];

		tasks.forEach((t) => {
			const li = document.createElement("li");
			li.className = "task-item";
			const chip = document.createElement("span");
			chip.className = `task-chip ${t.state}`;
			chip.textContent = t.state === "done" ? "בוצע" : t.state === "missed" ? "פספוס" : "ממתין";
			const text = document.createElement("span");
			text.textContent = t.label;
			li.appendChild(chip);
			li.appendChild(text);
			el.tasksList.appendChild(li);
		});
	}

	function renderAll() {
		renderHud();
		renderTasks();
		renderInventory();
	}

	// ---------- Actions ----------
	function toggleWork() {
		state.isWorking = !state.isWorking;
		renderHud();
	}

	function tryDropKids() {
		if (canDropKids(state.minuteOfDay)) {
			state.childrenAtKindergarten = true;
			state.kidsDroppedToday = true;
			renderTasks();
			toast("הילדים נמסרו לגן.");
		} else {
			toast("לא ניתן למסור עכשיו. חלון מסירה: 07:00 - 09:00", true);
		}
	}

	function tryPickupKids() {
		if (canPickupKids(state.minuteOfDay)) {
			state.childrenAtKindergarten = false;
			state.kidsPickedToday = true;
			renderTasks();
			toast("הילדים נאספו מהגן.");
		} else if (!state.childrenAtKindergarten) {
			toast("הילדים לא בגן כרגע.", true);
		} else {
			toast("לא ניתן לאסוף עכשיו. חלון איסוף: 14:00 עד 15:00", true);
		}
	}

	function purchaseItem(item) {
		if (state.money >= item.price) {
			state.money -= item.price;
			addInventory(item.id, 1);
			renderHud();
			renderInventory();
			toast(`נרכש: ${item.name}`);
		} else {
			toast("אין מספיק כסף!", true);
		}
	}

	// ---------- Game Loop ----------
	let lastTick = performance.now();
	let accumulator = 0;

	function gameTick(now) {
		const delta = now - lastTick;
		lastTick = now;
		accumulator += delta;

		while (accumulator >= REAL_MS_PER_GAME_MINUTE) {
			advanceOneMinute();
			accumulator -= REAL_MS_PER_GAME_MINUTE;
		}

		requestAnimationFrame(gameTick);
	}

	function advanceOneMinute() {
		// Earnings
		if (state.isWorking) {
			state.money += INCOME_PER_MINUTE;
		}

		// Time advance
		state.minuteOfDay += 1;

		// Day rollover
		if (state.minuteOfDay >= MINUTES_PER_DAY) {
			state.minuteOfDay = 0;
			state.dayNumber += 1;
			endOfDayChecks();
			resetDailyTasks();
		}

		// Missed pickup detection
		if (
			state.childrenAtKindergarten &&
			state.minuteOfDay > KINDERGARTEN_PICKUP_TIME + KINDERGARTEN_PICKUP_WINDOW &&
			!state.kidsPickedToday
		) {
			state.missedPickupToday = true;
		}

		// UI updates at reasonable cadence
		renderAll();
	}

	function endOfDayChecks() {
		// Penalty or note for missed pickup
		if (state.missedPickupToday) {
			// Optional penalty
			state.money = Math.max(0, state.money - 20);
			toast("פספסת את איסוף הילדים! קנס ₪20.", true);
		}
	}

	// ---------- Toast helper ----------
	let toastTimer = null;
	function toast(message, isError = false) {
		let bar = document.getElementById("toast");
		if (!bar) {
			bar = document.createElement("div");
			bar.id = "toast";
			bar.style.position = "fixed";
			bar.style.bottom = "16px";
			bar.style.left = "50%";
			bar.style.transform = "translateX(-50%)";
			bar.style.padding = "10px 14px";
			bar.style.borderRadius = "10px";
			bar.style.color = "#fff";
			bar.style.boxShadow = "0 6px 16px rgba(0,0,0,0.2)";
			bar.style.zIndex = "9999";
			document.body.appendChild(bar);
		}
		bar.style.background = isError ? "#e63946" : "#1b9c85";
		bar.textContent = message;
		bar.style.opacity = "1";
		bar.style.transition = "opacity 300ms ease";
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			bar.style.opacity = "0";
		}, 1800);
	}

	// ---------- Bindings ----------
	function bindEvents() {
		el.workToggle.addEventListener("click", toggleWork);
		el.dropKids.addEventListener("click", tryDropKids);
		el.pickupKids.addEventListener("click", tryPickupKids);
	}

	// ---------- Init ----------
	function init() {
		bindEvents();
		renderShop();
		renderAll();
		requestAnimationFrame((t) => {
			lastTick = t;
			requestAnimationFrame(gameTick);
		});
	}

	init();
})();


