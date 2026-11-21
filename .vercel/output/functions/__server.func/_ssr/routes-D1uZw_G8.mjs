import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-D1uZw_G8.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var STORAGE_KEY = "favoriteSongs";
var MENUS = [{
	id: "rankings",
	label: "Rankings",
	items: [
		{
			view: "top-songs",
			label: "Top Songs"
		},
		{
			view: "top-artists",
			label: "Top Artists"
		},
		{
			view: "top-albums",
			label: "Top Albums"
		}
	]
}, {
	id: "directory",
	label: "Directory",
	items: [
		{
			view: "songs",
			label: "All Songs"
		},
		{
			view: "all-artists",
			label: "All Artists"
		},
		{
			view: "all-albums",
			label: "All Albums"
		}
	]
}];
function loadSongs() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
function stars(rating) {
	const n = Math.max(1, Math.min(5, rating || 0));
	return "★".repeat(n) + "☆".repeat(5 - n);
}
function Home() {
	const [songs, setSongs] = (0, import_react.useState)([]);
	const [view, setView] = (0, import_react.useState)("songs");
	const [query, setQuery] = (0, import_react.useState)("");
	const [selectedId, setSelectedId] = (0, import_react.useState)(null);
	const [groupName, setGroupName] = (0, import_react.useState)(null);
	const [openMenu, setOpenMenu] = (0, import_react.useState)(null);
	const [adding, setAdding] = (0, import_react.useState)(false);
	const closeTimer = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		setSongs(loadSongs());
	}, []);
	(0, import_react.useEffect)(() => {
		return () => {
			if (closeTimer.current) window.clearTimeout(closeTimer.current);
		};
	}, []);
	function persist(next) {
		setSongs(next);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	}
	function open(id) {
		if (closeTimer.current) window.clearTimeout(closeTimer.current);
		setOpenMenu(id);
	}
	function scheduleClose() {
		if (closeTimer.current) window.clearTimeout(closeTimer.current);
		closeTimer.current = window.setTimeout(() => setOpenMenu(null), 220);
	}
	const q = query.trim().toLowerCase();
	const filteredSongs = (0, import_react.useMemo)(() => {
		const list = songs.filter((s) => !q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || s.album.toLowerCase().includes(q));
		if (view === "top-songs") return [...list].sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title));
		return list;
	}, [
		songs,
		q,
		view
	]);
	const artistRows = (0, import_react.useMemo)(() => {
		const map = /* @__PURE__ */ new Map();
		for (const song of songs) {
			const key = song.artist || "Unknown";
			if (q && !key.toLowerCase().includes(q) && !song.title.toLowerCase().includes(q)) continue;
			const bucket = map.get(key) ?? [];
			bucket.push(song);
			map.set(key, bucket);
		}
		const rows = [...map.entries()].map(([name, items]) => ({
			name,
			count: items.length,
			rating: items.reduce((sum, s) => sum + s.rating, 0) / items.length,
			items
		}));
		if (view === "top-artists") rows.sort((a, b) => b.rating - a.rating || b.count - a.count);
		else rows.sort((a, b) => a.name.localeCompare(b.name));
		return rows;
	}, [
		songs,
		q,
		view
	]);
	const albumRows = (0, import_react.useMemo)(() => {
		const map = /* @__PURE__ */ new Map();
		for (const song of songs) {
			const key = song.album || "Single";
			if (q && !key.toLowerCase().includes(q) && !song.title.toLowerCase().includes(q)) continue;
			const bucket = map.get(key) ?? [];
			bucket.push(song);
			map.set(key, bucket);
		}
		const rows = [...map.entries()].map(([name, items]) => ({
			name,
			count: items.length,
			rating: items.reduce((sum, s) => sum + s.rating, 0) / items.length,
			artist: items[0]?.artist ?? "",
			items
		}));
		if (view === "top-albums") rows.sort((a, b) => b.rating - a.rating || b.count - a.count);
		else rows.sort((a, b) => a.name.localeCompare(b.name));
		return rows;
	}, [
		songs,
		q,
		view
	]);
	const showingSongs = view === "songs" || view === "top-songs";
	const showingArtists = view === "top-artists" || view === "all-artists";
	const selected = songs.find((s) => s.id === selectedId) ?? null;
	const heading = view === "songs" ? "TOP 150" : MENUS.flatMap((m) => m.items).find((item) => item.view === view)?.label ?? "TOP 150";
	function chooseView(next) {
		setView(next);
		setSelectedId(null);
		setGroupName(null);
		setOpenMenu(null);
	}
	function removeSong(id) {
		persist(songs.filter((s) => s.id !== id));
		setSelectedId(null);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "app-shell",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "nav",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "brand",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						className: "avatar",
						src: "/avatar.png",
						alt: "Garrett Jahnke"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "brand-name",
						children: "Garrett Jahnke"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "brand-sub",
						children: "My KPOP Database"
					})] })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
					className: "nav-links",
					"aria-label": "Library",
					children: MENUS.map((menu) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: openMenu === menu.id ? "menu is-open" : "menu",
						onMouseEnter: () => open(menu.id),
						onMouseLeave: scheduleClose,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "menu-trigger",
							"aria-expanded": openMenu === menu.id,
							"aria-haspopup": "true",
							onFocus: () => open(menu.id),
							children: menu.label
						}), openMenu === menu.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "menu-panel",
							role: "menu",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "menu-card",
								children: menu.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									role: "menuitem",
									className: view === item.view ? "is-active" : void 0,
									onClick: () => chooseView(item.view),
									children: item.label
								}, item.view))
							})
						}) : null]
					}, menu.id))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "edge edge-h",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "edge-fill" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "edge-stroke" })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "workspace",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
					className: "sidebar",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "sidebar-head",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: heading }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "add-btn",
								onClick: () => setAdding(true),
								children: "+ Add"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: "search",
							value: query,
							onChange: (e) => setQuery(e.target.value),
							placeholder: "Search...",
							"aria-label": "Search"
						}),
						showingSongs ? filteredSongs.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "empty",
							children: [
								"No favorite songs yet.",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
								"Click ",
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "+ Add" }),
								" to get started."
							]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "list",
							children: filteredSongs.map((song) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: song.id === selectedId ? "row is-selected" : "row",
								onClick: () => {
									setSelectedId(song.id);
									setGroupName(null);
								},
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "row-title",
									children: song.title
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "row-sub",
									children: song.artist
								})]
							}, song.id))
						}) : null,
						showingArtists ? artistRows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "empty",
							children: "No artists yet."
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "list",
							children: artistRows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: groupName === row.name ? "row is-selected" : "row",
								onClick: () => {
									setGroupName(row.name);
									setSelectedId(null);
								},
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "row-title",
									children: row.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "row-sub",
									children: [
										row.count,
										" song",
										row.count === 1 ? "" : "s",
										" · ",
										stars(Math.round(row.rating))
									]
								})]
							}, row.name))
						}) : null,
						!showingSongs && !showingArtists ? albumRows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "empty",
							children: "No albums yet."
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "list",
							children: albumRows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: groupName === row.name ? "row is-selected" : "row",
								onClick: () => {
									setGroupName(row.name);
									setSelectedId(null);
								},
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "row-title",
									children: row.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "row-sub",
									children: [
										row.artist,
										" · ",
										row.count,
										" song",
										row.count === 1 ? "" : "s"
									]
								})]
							}, row.name))
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "edge edge-v",
							"aria-hidden": "true",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "edge-fill" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "edge-stroke" })]
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
					className: "main",
					children: selected ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: "detail",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: selected.title }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "byline",
								children: selected.artist
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid",
								children: [
									selected.album ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "card",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Album" }), selected.album]
									}) : null,
									selected.year ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "card",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Year" }), selected.year]
									}) : null,
									selected.genre ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "card",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Genre" }), selected.genre]
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "card",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Rating" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "stars",
											children: stars(selected.rating)
										})]
									})
								]
							}),
							selected.notes ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "notes",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Notes" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: selected.notes })]
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "danger",
								onClick: () => removeSong(selected.id),
								children: "Delete Song"
							})
						]
					}) : groupName && showingArtists ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GroupDetail, {
						title: groupName,
						subtitle: "Artist",
						songs: artistRows.find((r) => r.name === groupName)?.items ?? [],
						onOpen: (id) => setSelectedId(id)
					}) : groupName ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GroupDetail, {
						title: groupName,
						subtitle: "Album",
						songs: albumRows.find((r) => r.name === groupName)?.items ?? [],
						onOpen: (id) => setSelectedId(id)
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "placeholder",
						children: "Select something from the list to view details"
					})
				})]
			}),
			adding ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddModal, {
				onClose: () => setAdding(false),
				onSave: (song) => {
					persist([song, ...songs]);
					setView("songs");
					setSelectedId(song.id);
					setGroupName(null);
					setAdding(false);
				}
			}) : null
		]
	});
}
function GroupDetail({ title, subtitle, songs, onOpen }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "detail",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: title }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "byline",
				children: subtitle
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "song-links",
				children: songs.map((song) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => onOpen(song.id),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "row-title",
						children: song.title
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "row-sub",
						children: [
							song.artist,
							song.album ? ` · ${song.album}` : "",
							" · ",
							stars(song.rating)
						]
					})]
				}, song.id))
			})
		]
	});
}
function AddModal({ onClose, onSave }) {
	function submit(form) {
		const title = String(form.get("title") ?? "").trim();
		const artist = String(form.get("artist") ?? "").trim();
		if (!title || !artist) return;
		onSave({
			id: Date.now(),
			title,
			artist,
			album: String(form.get("album") ?? "").trim(),
			year: String(form.get("year") ?? "").trim(),
			genre: String(form.get("genre") ?? "").trim(),
			rating: Number(form.get("rating") ?? 5),
			notes: String(form.get("notes") ?? "").trim()
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "modal",
		role: "presentation",
		onClick: onClose,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			className: "modal-card",
			onClick: (e) => e.stopPropagation(),
			onSubmit: (e) => {
				e.preventDefault();
				submit(new FormData(e.currentTarget));
			},
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Add a Song" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						htmlFor: "title",
						children: "Title"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						id: "title",
						name: "title",
						required: true
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						htmlFor: "artist",
						children: "Artist"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						id: "artist",
						name: "artist",
						required: true
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						htmlFor: "album",
						children: "Album"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						id: "album",
						name: "album"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						htmlFor: "year",
						children: "Year"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						id: "year",
						name: "year",
						inputMode: "numeric"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						htmlFor: "genre",
						children: "Genre"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						id: "genre",
						name: "genre"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						htmlFor: "rating",
						children: "Rating"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						id: "rating",
						name: "rating",
						defaultValue: "5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "5",
								children: "★★★★★ (5)"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "4",
								children: "★★★★☆ (4)"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "3",
								children: "★★★☆☆ (3)"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "2",
								children: "★★☆☆☆ (2)"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "1",
								children: "★☆☆☆☆ (1)"
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
						htmlFor: "notes",
						children: "Notes"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
						id: "notes",
						name: "notes",
						placeholder: "Why do you love this song?"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "actions",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						className: "primary",
						type: "submit",
						children: "Add Song"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						className: "ghost",
						type: "button",
						onClick: onClose,
						children: "Cancel"
					})]
				})
			]
		})
	});
}
//#endregion
export { Home as component };
