import math
import random
import sys
import pygame
from pygame.locals import *
from OpenGL.GL import *
from OpenGL.GLU import *

# ------------------------------------------------------------
# Setup
# ------------------------------------------------------------
pygame.init()
pygame.font.init()
clock = pygame.time.Clock()

WIDTH, HEIGHT = 1280, 720
screen = pygame.display.set_mode((WIDTH, HEIGHT), DOUBLEBUF | OPENGL | RESIZABLE)
pygame.display.set_caption("Neon Siege 3D")
pygame.event.set_grab(True)
pygame.mouse.set_visible(False)

glEnable(GL_DEPTH_TEST)
glEnable(GL_CULL_FACE)
glCullFace(GL_BACK)
glClearColor(0.05, 0.07, 0.12, 1.0)

# Fonts
small_font = pygame.font.SysFont("arial", 18, bold=True)
hud_font = pygame.font.SysFont("arial", 20, bold=True)
big_font = pygame.font.SysFont("arial", 42, bold=True)

# ------------------------------------------------------------
# Map
# ------------------------------------------------------------
MAP = [
    "####################",
    "#..............E...#",
    "#.##....#.........#",
    "#....#...#.........#",
    "#....#......E......#",
    "#........#.........#",
    "#..##......#.......#",
    "#...........#......#",
    "#....E....#........#",
    "#..........#.......#",
    "#......###.........#",
    "#....#.............#",
    "#....#....E........#",
    "#.................E#",
    "#.........#........#",
    "#..................#",
    "####################",
]

WEAPONS = [
    {"name": "Pulse Rifle", "mag": 30, "reserve": 90, "damage": 25, "fire_rate": 0.12, "speed": 18, "spread": 0.04, "reload": 1.2, "pellets": 1, "color": (1.0, 0.85, 0.38)},
    {"name": "Scatter Shot", "mag": 8, "reserve": 24, "damage": 9, "fire_rate": 0.42, "speed": 14, "spread": 0.18, "pellets": 7, "reload": 1.5, "color": (1.0, 0.60, 0.36)},
    {"name": "Plasma Carbine", "mag": 18, "reserve": 54, "damage": 34, "fire_rate": 0.15, "speed": 22, "spread": 0.02, "reload": 1.5, "pellets": 1, "color": (0.43, 0.96, 1.0)},
]

# ------------------------------------------------------------
# Player and game state
# ------------------------------------------------------------
player = {
    "x": 2.5,
    "y": 1.6,
    "z": 2.5,
    "yaw": 0.0,
    "pitch": 0.0,
    "health": 100,
    "score": 0,
    "speed": 2.7,
    "sprint_speed": 4.2,
}

game = {
    "started": False,
    "paused": False,
    "over": False,
    "wave": 1,
    "weapon_index": 0,
    "mag": WEAPONS[0]["mag"],
    "reserve": WEAPONS[0]["reserve"],
    "fire_cooldown": 0.0,
    "reload_timer": 0.0,
    "bullets": [],
    "enemy_bullets": [],
    "enemies": [],
    "particles": [],
    "message": "CLICK TO START",
    "screen_width": WIDTH,
    "screen_height": HEIGHT,
}

keys = set()

# ------------------------------------------------------------
# Utility
# ------------------------------------------------------------
def clamp(v, lo, hi):
    return max(lo, min(v, hi))


def normalize_angle(a):
    while a < -math.pi:
        a += 2 * math.pi
    while a > math.pi:
        a -= 2 * math.pi
    return a


def dist_2d(x1, z1, x2, z2):
    return math.hypot(x1 - x2, z1 - z2)


def is_wall(x, z):
    gx = int(x)
    gz = int(z)
    if gx < 0 or gz < 0 or gx >= len(MAP[0]) or gz >= len(MAP):
        return True
    return MAP[gz][gx] == "#"


def set_message(msg):
    game["message"] = msg

# ------------------------------------------------------------
# Reset and spawn functions
# ------------------------------------------------------------
def reset_game():
    player["x"] = 2.5
    player["y"] = 1.6
    player["z"] = 2.5
    player["yaw"] = 0.0
    player["pitch"] = 0.0
    player["health"] = 100
    player["score"] = 0

    game["wave"] = 1
    game["weapon_index"] = 0
    game["mag"] = WEAPONS[0]["mag"]
    game["reserve"] = WEAPONS[0]["reserve"]
    game["fire_cooldown"] = 0.0
    game["reload_timer"] = 0.0
    game["bullets"] = []
    game["enemy_bullets"] = []
    game["particles"] = []
    game["over"] = False
    game["paused"] = False
    game["enemies"] = []
    spawn_wave()
    set_message(f"Wave {game['wave']}")


def spawn_enemy():
    for _ in range(250):
        x = random.uniform(2, len(MAP[0]) - 2)
        z = random.uniform(2, len(MAP) - 2)
        if not is_wall(x, z) and dist_2d(x, z, player["x"], player["z"]) > 6:
            is_boss = (game["wave"] % 3 == 0 and random.random() < 0.25)
            hp = 7 if is_boss else 2
            speed = 0.9 if is_boss else 1.4
            color = (1.0, 0.35, 0.42, 1.0) if is_boss else (1.0, 0.56, 0.35, 1.0)
            game["enemies"].append({
                "x": x,
                "y": 1.5 if is_boss else 0.9,
                "z": z,
                "hp": hp,
                "max_hp": hp,
                "speed": speed,
                "alive": True,
                "flash": 0.0,
                "cooldown": random.random() * 1.2,
                "color": color,
                "type": "boss" if is_boss else "grunt",
                "sx": 1.3 if is_boss else 0.8,
                "sy": 2.8 if is_boss else 1.8,
                "sz": 1.3 if is_boss else 0.8,
            })
            return


def spawn_wave():
    count = 4 + game["wave"] * 2
    game["enemies"] = []
    for _ in range(count):
        spawn_enemy()
    set_message(f"Wave {game['wave']}")


def add_particles(x, y, z, color, count=15):
    for _ in range(count):
        game["particles"].append({
            "x": x,
            "y": y,
            "z": z,
            "vx": random.uniform(-1.2, 1.2),
            "vy": random.uniform(0.5, 1.7),
            "vz": random.uniform(-1.2, 1.2),
            "life": random.uniform(0.5, 1.0),
            "color": color,
        })

# ------------------------------------------------------------
# Weapon logic
# ------------------------------------------------------------
def reload_weapon():
    if game["reload_timer"] > 0:
        return
    weapon = WEAPONS[game["weapon_index"]]
    if game["mag"] >= weapon["mag"] or game["reserve"] <= 0:
        return
    game["reload_timer"] = weapon["reload"]
    set_message(f"Reloading {weapon['name']}")


def finish_reload():
    weapon = WEAPONS[game["weapon_index"]]
    needed = weapon["mag"] - game["mag"]
    add = min(needed, game["reserve"])
    game["mag"] += add
    game["reserve"] -= add
    set_message(f"{weapon['name']} ready")


def cycle_weapon(direction):
    if game["reload_timer"] > 0:
        return
    game["weapon_index"] = (game["weapon_index"] + direction) % len(WEAPONS)
    weapon = WEAPONS[game["weapon_index"]]
    game["mag"] = min(game["mag"], weapon["mag"])
    set_message(f"{weapon['name']} equipped")


def fire_weapon():
    if not game["started"] or game["over"] or game["paused"]:
        return
    if game["reload_timer"] > 0:
        return
    if game["mag"] <= 0:
        reload_weapon()
        return
    if game["fire_cooldown"] > 0:
        return

    weapon = WEAPONS[game["weapon_index"]]
    game["mag"] -= 1
    game["fire_cooldown"] = weapon["fire_rate"]

    pellets = weapon.get("pellets", 1)
    for _ in range(pellets):
        spread = random.uniform(-weapon["spread"], weapon["spread"])
        yaw = player["yaw"] + spread
        dx = math.cos(yaw)
        dz = math.sin(yaw)
        game["bullets"].append({
            "x": player["x"] + dx * 0.8,
            "y": player["y"] + 0.7,
            "z": player["z"] + dz * 0.8,
            "vx": dx * weapon["speed"],
            "vy": 0.0,
            "vz": dz * weapon["speed"],
            "life": 2.1,
            "color": weapon["color"],
        })

    if game["mag"] == 0 and game["reserve"] > 0:
        reload_weapon()

# ------------------------------------------------------------
# Update logic
# ------------------------------------------------------------
def update_player(dt):
    move_x = (1 if keys.__contains__(K_d) else 0) - (1 if keys.__contains__(K_a) else 0)
    move_z = (1 if keys.__contains__(K_w) else 0) - (1 if keys.__contains__(K_s) else 0)

    if move_x != 0 or move_z != 0:
        length = math.hypot(move_x, move_z) or 1
        move_x /= length
        move_z /= length

        sprinting = keys.__contains__(K_LSHIFT)
        speed = player["sprint_speed"] if sprinting else player["speed"]

        forward_x = math.cos(player["yaw"])
        forward_z = math.sin(player["yaw"])
        right_x = math.cos(player["yaw"] + math.pi / 2)
        right_z = math.sin(player["yaw"] + math.pi / 2)

        dx = forward_x * move_z + right_x * move_x
        dz = forward_z * move_z + right_z * move_x

        nx = player["x"] + dx * speed * dt
        nz = player["z"] + dz * speed * dt

        if not is_wall(nx, player["z"]):
            player["x"] = nx
        if not is_wall(player["x"], nz):
            player["z"] = nz

        player["x"] = clamp(player["x"], 1.0, len(MAP[0]) - 2.0)
        player["z"] = clamp(player["z"], 1.0, len(MAP) - 2.0)


def update_bullets(dt):
    for bullet in game["bullets"][:]:
        bullet["x"] += bullet["vx"] * dt
        bullet["z"] += bullet["vz"] * dt
        bullet["life"] -= dt
        if bullet["life"] <= 0 or is_wall(bullet["x"], bullet["z"]):
            game["bullets"].remove(bullet)
            continue

        for enemy in game["enemies"]:
            if not enemy["alive"]:
                continue
            if dist_2d(bullet["x"], bullet["z"], enemy["x"], enemy["z"]) < 0.7:
                enemy["hp"] -= WEAPONS[game["weapon_index"]]["damage"]
                enemy["flash"] = 0.15
                game["bullets"].remove(bullet)
                if enemy["hp"] <= 0:
                    enemy["alive"] = False
                    player["score"] += 15 if enemy["type"] == "grunt" else 35
                    add_particles(enemy["x"], enemy["y"], enemy["z"], enemy["color"], 18)
                break

    for bullet in game["enemy_bullets"][:]:
        bullet["x"] += bullet["vx"] * dt
        bullet["z"] += bullet["vz"] * dt
        bullet["life"] -= dt
        if bullet["life"] <= 0 or is_wall(bullet["x"], bullet["z"]):
            game["enemy_bullets"].remove(bullet)
            continue
        if dist_2d(bullet["x"], bullet["z"], player["x"], player["z"]) < 0.75:
            player["health"] -= 12
            game["enemy_bullets"].remove(bullet)
            if player["health"] <= 0:
                player["health"] = 0
                game["over"] = True
                pygame.mouse.set_visible(True)
                set_message("Mission Failed")


def update_particles(dt):
    for p in game["particles"][:]:
        p["x"] += p["vx"] * dt
        p["y"] += p["vy"] * dt
        p["z"] += p["vz"] * dt
        p["vy"] -= 3.5 * dt
        p["life"] -= dt
        if p["life"] <= 0:
            game["particles"].remove(p)


def update_enemies(dt):
    for enemy in game["enemies"]:
        if not enemy["alive"]:
            continue
        enemy["flash"] = max(0.0, enemy["flash"] - dt)
        enemy["cooldown"] -= dt

        dx = player["x"] - enemy["x"]
        dz = player["z"] - enemy["z"]
        d = math.hypot(dx, dz)
        if d > 0.0001:
            nx = enemy["x"] + (dx / d) * enemy["speed"] * dt
            nz = enemy["z"] + (dz / d) * enemy["speed"] * dt
            if not is_wall(nx, enemy["z"]):
                enemy["x"] = nx
            if not is_wall(enemy["x"], nz):
                enemy["z"] = nz

        if d < 1.5 and enemy["cooldown"] <= 0:
            angle = math.atan2(player["z"] - enemy["z"], player["x"] - enemy["x"])
            game["enemy_bullets"].append({
                "x": enemy["x"],
                "y": enemy["y"],
                "z": enemy["z"],
                "vx": math.cos(angle) * 5.8,
                "vy": 0.0,
                "vz": math.sin(angle) * 5.8,
                "life": 2.2,
            })
            enemy["cooldown"] = 1.0 + random.random() * 0.8

    if not any(enemy["alive"] for enemy in game["enemies"]):
        game["wave"] += 1
        spawn_wave()


def update_game(dt):
    if not game["started"] or game["paused"] or game["over"]:
        return

    if game["reload_timer"] > 0:
        game["reload_timer"] -= dt
        if game["reload_timer"] <= 0:
            weapon = WEAPONS[game["weapon_index"]]
            needed = weapon["mag"] - game["mag"]
            add = min(needed, game["reserve"])
            game["mag"] += add
            game["reserve"] -= add
            set_message(f"{weapon['name']} ready")

    game["fire_cooldown"] = max(0.0, game["fire_cooldown"] - dt)
    update_player(dt)
    update_bullets(dt)
    update_particles(dt)
    update_enemies(dt)

# ------------------------------------------------------------
# 3D drawing
# ------------------------------------------------------------
def draw_box(x, y, z, sx, sy, sz, color):
    r, g, b, a = color
    glPushMatrix()
    glTranslatef(x, y, z)
    glColor4f(r, g, b, a)

    glBegin(GL_QUADS)
    glVertex3f(-sx/2, -sy/2, sz/2); glVertex3f(sx/2, -sy/2, sz/2); glVertex3f(sx/2, sy/2, sz/2); glVertex3f(-sx/2, sy/2, sz/2)
    glVertex3f(-sx/2, -sy/2, -sz/2); glVertex3f(-sx/2, sy/2, -sz/2); glVertex3f(sx/2, sy/2, -sz/2); glVertex3f(sx/2, -sy/2, -sz/2)
    glVertex3f(-sx/2, -sy/2, -sz/2); glVertex3f(-sx/2, -sy/2, sz/2); glVertex3f(-sx/2, sy/2, sz/2); glVertex3f(-sx/2, sy/2, -sz/2)
    glVertex3f(sx/2, -sy/2, -sz/2); glVertex3f(sx/2, sy/2, -sz/2); glVertex3f(sx/2, sy/2, sz/2); glVertex3f(sx/2, -sy/2, sz/2)
    glVertex3f(-sx/2, sy/2, -sz/2); glVertex3f(-sx/2, sy/2, sz/2); glVertex3f(sx/2, sy/2, sz/2); glVertex3f(sx/2, sy/2, -sz/2)
    glVertex3f(-sx/2, -sy/2, -sz/2); glVertex3f(sx/2, -sy/2, -sz/2); glVertex3f(sx/2, -sy/2, sz/2); glVertex3f(-sx/2, -sy/2, sz/2)
    glEnd()
    glPopMatrix()


def draw_floor_grid():
    glColor4f(0.2, 0.24, 0.28, 1.0)
    glBegin(GL_QUADS)
    glVertex3f(-50.0, -0.1, -50.0)
    glVertex3f(-50.0, -0.1, 50.0)
    glVertex3f(50.0, -0.1, 50.0)
    glVertex3f(50.0, -0.1, -50.0)
    glEnd()

    glColor4f(0.3, 0.34, 0.38, 0.7)
    for i in range(-20, 21):
        glBegin(GL_LINES)
        glVertex3f(i, 0.0, -20.0); glVertex3f(i, 0.0, 20.0)
        glEnd()
    for i in range(-20, 21):
        glBegin(GL_LINES)
        glVertex3f(-20.0, 0.0, i); glVertex3f(20.0, 0.0, i)
        glEnd()


def draw_walls():
    for gz, row in enumerate(MAP):
        for gx, cell in enumerate(row):
            if cell == "#":
                draw_box(gx + 0.5, 1.0, gz + 0.5, 1.0, 2.0, 1.0, (0.35, 0.45, 0.6, 1.0))


def draw_enemies():
    for enemy in game["enemies"]:
        if not enemy["alive"]:
            continue
        glow = 1.0 if enemy["flash"] > 0 else 0.85
        color = (enemy["color"][0] * glow, enemy["color"][1] * glow, enemy["color"][2] * glow, 1.0)
        draw_box(enemy["x"], enemy["y"], enemy["z"], enemy["sx"], enemy["sy"], enemy["sz"], color)


def draw_particles():
    for p in game["particles"]:
        glPushMatrix()
        glTranslatef(p["x"], p["y"], p["z"])
        glColor4f(*p["color"], 1.0)
        glBegin(GL_QUADS)
        glVertex3f(-0.05, -0.05, 0.05); glVertex3f(0.05, -0.05, 0.05); glVertex3f(0.05, 0.05, 0.05); glVertex3f(-0.05, 0.05, 0.05)
        glEnd()
        glPopMatrix()


def draw_bullets():
    for bullet in game["bullets"]:
        draw_box(bullet["x"], bullet["y"], bullet["z"], 0.12, 0.12, 0.12, (1.0, 0.82, 0.35, 1.0))
    for bullet in game["enemy_bullets"]:
        draw_box(bullet["x"], bullet["y"], bullet["z"], 0.12, 0.12, 0.12, (1.0, 0.35, 0.42, 1.0))


def set_camera():
    glMatrixMode(GL_PROJECTION)
    glLoadIdentity()
    gluPerspective(70.0, game["screen_width"] / float(game["screen_height"]), 0.1, 1000.0)

    glMatrixMode(GL_MODELVIEW)
    glLoadIdentity()
    target_x = player["x"] + math.cos(player["yaw"])
    target_z = player["z"] + math.sin(player["yaw"])
    target_y = player["y"] + math.tan(player["pitch"])
    gluLookAt(player["x"], player["y"], player["z"], target_x, target_y, target_z, 0.0, 1.0, 0.0)


def draw_start_screen():
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)
    glMatrixMode(GL_PROJECTION)
    glLoadIdentity()
    glOrtho(0, WIDTH, 0, HEIGHT, -1, 1)
    glMatrixMode(GL_MODELVIEW)
    glLoadIdentity()

    glColor4f(0.06, 0.09, 0.14, 1.0)
    glBegin(GL_QUADS)
    glVertex2f(0, 0); glVertex2f(WIDTH, 0); glVertex2f(WIDTH, HEIGHT); glVertex2f(0, HEIGHT)
    glEnd()

    title = big_font.render("NEON SIEGE", True, (0.43, 0.96, 1.0))
    subtitle = small_font.render("WASD move • Mouse aim • Click shoot • R reload • Q/E switch • Shift sprint", True, (255, 255, 255))
    button = pygame.Rect(WIDTH // 2 - 160, HEIGHT // 2 + 80, 320, 60)

    screen.blit(title, (WIDTH // 2 - title.get_width() // 2, HEIGHT // 2 - 120))
    screen.blit(subtitle, (WIDTH // 2 - subtitle.get_width() // 2, HEIGHT // 2 - 20))
    pygame.draw.rect(screen, (0.43, 0.96, 1.0), button, border_radius=10)
    start_text = small_font.render("START MISSION", True, (0, 0, 0))
    screen.blit(start_text, (WIDTH // 2 - start_text.get_width() // 2, HEIGHT // 2 + 95))
    pygame.display.flip()


def draw_hud_overlay():
    glMatrixMode(GL_PROJECTION)
    glPushMatrix()
    glLoadIdentity()
    glOrtho(0, WIDTH, 0, HEIGHT, -1, 1)

    glMatrixMode(GL_MODELVIEW)
    glPushMatrix()
    glLoadIdentity()

    glColor4f(0.12, 0.16, 0.22, 1.0)
    glBegin(GL_QUADS)
    glVertex2f(20, HEIGHT - 50); glVertex2f(240, HEIGHT - 50); glVertex2f(240, HEIGHT - 20); glVertex2f(20, HEIGHT - 20)
    glEnd()

    glColor4f(0.4, 1.0, 0.65, 1.0)
    glBegin(GL_QUADS)
    glVertex2f(20, HEIGHT - 50); glVertex2f(20 + 220 * (player["health"] / 100), HEIGHT - 50); glVertex2f(20 + 220 * (player["health"] / 100), HEIGHT - 20); glVertex2f(20, HEIGHT - 20)
    glEnd()

    glColor4f(1.0, 1.0, 1.0, 0.9)
    glBegin(GL_LINES)
    glVertex2f(WIDTH / 2 - 10, HEIGHT / 2); glVertex2f(WIDTH / 2 + 10, HEIGHT / 2)
    glVertex2f(WIDTH / 2, HEIGHT / 2 - 10); glVertex2f(WIDTH / 2, HEIGHT / 2 + 10)
    glEnd()

    glColor4f(0.12, 0.16, 0.22, 0.9)
    glBegin(GL_QUADS)
    glVertex2f(20, 20); glVertex2f(420, 20); glVertex2f(420, 95); glVertex2f(20, 95)
    glEnd()

    glMatrixMode(GL_MODELVIEW)
    glPopMatrix()
    glMatrixMode(GL_PROJECTION)
    glPopMatrix()

    weapon = WEAPONS[game["weapon_index"]]
    health_label = hud_font.render(f"HP: {int(player['health'])}", True, (255, 255, 255))
    weapon_label = hud_font.render(f"{weapon['name']} | Ammo: {game['mag']} / {game['reserve']}", True, (255, 255, 255))
    score_label = hud_font.render(f"Score: {player['score']} | Wave: {game['wave']}", True, (255, 255, 255))
    msg_label = small_font.render(game["message"], True, (255, 255, 255))

    screen.blit(health_label, (30, HEIGHT - 52))
    screen.blit(weapon_label, (30, 30))
    screen.blit(score_label, (WIDTH - 220, 30))
    screen.blit(msg_label, (WIDTH // 2 - msg_label.get_width() // 2, 14))

    if game["over"]:
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 160))
        screen.blit(overlay, (0, 0))
        title = big_font.render("MISSION FAILED", True, (1.0, 0.35, 0.38))
        screen.blit(title, (WIDTH // 2 - title.get_width() // 2, HEIGHT // 2 - 40))
        small = small_font.render("CLICK TO RESTART", True, (255, 255, 255))
        screen.blit(small, (WIDTH // 2 - small.get_width() // 2, HEIGHT // 2 + 30))

    if game["paused"]:
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 150))
        screen.blit(overlay, (0, 0))
        msg = big_font.render("PAUSED", True, (0.43, 0.96, 1.0))
        screen.blit(msg, (WIDTH // 2 - msg.get_width() // 2, HEIGHT // 2 - 20))


def draw_3d_scene():
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)
    set_camera()
    draw_floor_grid()
    draw_walls()
    draw_enemies()
    draw_particles()
    draw_bullets()
    draw_hud_overlay()
    pygame.display.flip()


def start_game():
    reset_game()
    game["started"] = True
    game["paused"] = False
    game["over"] = False
    pygame.mouse.set_visible(False)
    pygame.event.set_grab(True)


def main():
    while True:
        dt = min(0.033, clock.tick(60) / 1000.0)

        for event in pygame.event.get():
            if event.type == QUIT:
                pygame.quit()
                sys.exit()

            if event.type == VIDEORESIZE:
                global WIDTH, HEIGHT
                WIDTH, HEIGHT = event.size
                screen = pygame.display.set_mode((WIDTH, HEIGHT), DOUBLEBUF | OPENGL | RESIZABLE)
                game["screen_width"] = WIDTH
                game["screen_height"] = HEIGHT

            if event.type == MOUSEBUTTONDOWN:
                if not game["started"]:
                    start_game()
                elif game["over"]:
                    start_game()
                elif not game["paused"]:
                    fire_weapon()

            if event.type == KEYDOWN:
                keys.add(event.key)

                if event.key == K_ESCAPE and game["started"] and not game["over"]:
                    game["paused"] = not game["paused"]
                    pygame.mouse.set_visible(game["paused"])
                    if not game["paused"]:
                        pygame.mouse.set_visible(False)
                        pygame.event.set_grab(True)

                if event.key == K_r:
                    reload_weapon()

                if event.key == K_q:
                    cycle_weapon(-1)

                if event.key == K_e:
                    cycle_weapon(1)

                if event.key == K_SPACE and game["started"] and not game["paused"] and not game["over"]:
                    fire_weapon()

            if event.type == KEYUP:
                if event.key in keys:
                    keys.remove(event.key)

            if event.type == MOUSEMOTION:
                if pygame.mouse.get_focused() and game["started"] and not game["paused"] and not game["over"]:
                    dx, dy = event.rel
                    player["yaw"] -= dx * 0.0022
                    player["pitch"] = clamp(player["pitch"] - dy * 0.0017, -1.2, 1.2)

        if not game["started"]:
            draw_start_screen()
            continue

        if game["started"] and not game["paused"] and not game["over"]:
            if game["reload_timer"] > 0:
                game["reload_timer"] -= dt
                if game["reload_timer"] <= 0:
                    weapon = WEAPONS[game["weapon_index"]]
                    needed = weapon["mag"] - game["mag"]
                    add = min(needed, game["reserve"])
                    game["mag"] += add
                    game["reserve"] -= add
                    set_message(f"{weapon['name']} ready")

            game["fire_cooldown"] = max(0.0, game["fire_cooldown"] - dt)
            update_player(dt)
            update_bullets(dt)
            update_particles(dt)
            update_enemies(dt)

        draw_3d_scene()


if __name__ == "__main__":
    reset_game()
    game["started"] = False
    pygame.mouse.set_visible(True)
    pygame.event.set_grab(False)
    main()
