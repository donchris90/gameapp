# Car pipeline
Makes light, game-ready car files from big downloaded `.glb` models (drops the interior, cuts triangles, shrinks textures, splits the wheels so they spin, names the body paint so the game can recolour it).

    cd tools/car-pipeline && npm install
    node optimize_car.mjs cars/cadillac.hi.json      # then cadillac.lo.json for the rivals' lighter version

Each `cars/*.json` says which parts to drop (`drop`, `dropNodes`), which are wheels (`wheels`, `wheelNodes`), which is the body paint (`paint`, `paintNodes`),
whether the car faces +z (`frontIsPlusZ`), and the triangle and texture budgets. The `input` paths point at the downloaded files on the machine that ran it.
The old Koenigsegg files (`one1_*.glb`) were made with `tools/obj_to_car_glb.py` from an OBJ.
